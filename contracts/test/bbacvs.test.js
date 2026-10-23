const { expect } = require("chai");
const { ethers } = require("hardhat");

// End-to-end exercise of the on-chain stack: governance -> issuer reg -> issue -> verify -> revoke.
describe("BBACVS on-chain stack", function () {
  let safe, issuerRegistry, revocationRegistry, credentialRegistry;
  let zaqa, ecz, hea, issuer, other, issuerB;

  const DID = ethers.encodeBytes32String("did:ethr:unza");
  const INSTITUTION = ethers.encodeBytes32String("UNZA");
  const credHash = ethers.keccak256(ethers.toUtf8Bytes("vc-document-1"));
  const cidHash = ethers.keccak256(ethers.toUtf8Bytes("Qm-cid-1"));

  beforeEach(async function () {
    [zaqa, ecz, hea, issuer, other, issuerB] = await ethers.getSigners();

    const Safe = await ethers.getContractFactory("GovernanceSafe");
    safe = await Safe.deploy([zaqa.address, ecz.address, hea.address], 2);

    const IssuerRegistry = await ethers.getContractFactory("IssuerRegistry");
    issuerRegistry = await IssuerRegistry.deploy(await safe.getAddress());

    const RevocationRegistry = await ethers.getContractFactory("RevocationRegistry");
    revocationRegistry = await RevocationRegistry.deploy(
      await issuerRegistry.getAddress(),
      await safe.getAddress()
    );

    const CredentialRegistry = await ethers.getContractFactory("CredentialRegistry");
    credentialRegistry = await CredentialRegistry.deploy(
      await issuerRegistry.getAddress(),
      await revocationRegistry.getAddress(),
      await safe.getAddress()
    );
    await revocationRegistry.bindCredentialRegistry(await credentialRegistry.getAddress());
  });

  // Helper: run any privileged call through the 2-of-3 GovernanceSafe (ZAQA proposes, ECZ
  // confirms -> auto-executes at threshold). Returns the safe txId.
  async function viaGovernance(to, data) {
    const txId = await safe.transactionCount();
    await safe.connect(zaqa).proposeTransaction(to, 0, data); // 1st confirm
    await safe.connect(ecz).confirmTransaction(txId);        // 2nd confirm -> auto-executes
    return txId;
  }

  // Helper: register an issuer through a 2-of-3 multi-sig proposal+confirm.
  async function authoriseIssuer(account) {
    const data = issuerRegistry.interface.encodeFunctionData("grantIssuerRole", [
      account,
      DID,
      INSTITUTION,
    ]);
    await viaGovernance(await issuerRegistry.getAddress(), data);
  }

  it("requires 2-of-3 governance to authorise an issuer", async function () {
    expect(await issuerRegistry.isAuthorised(issuer.address)).to.equal(false);
    await authoriseIssuer(issuer.address);
    expect(await issuerRegistry.isAuthorised(issuer.address)).to.equal(true);
  });

  it("rejects issuance from unauthorised accounts", async function () {
    await expect(
      credentialRegistry.connect(other).issueCredential(credHash, cidHash)
    ).to.be.revertedWith("Credential: not authorised issuer");
  });

  it("anchors and verifies a credential", async function () {
    await authoriseIssuer(issuer.address);
    await credentialRegistry.connect(issuer).issueCredential(credHash, cidHash);

    const [status] = await credentialRegistry.verifyCredential(credHash);
    expect(status).to.equal(1); // Verified
  });

  it("reports REVOKED after revocation", async function () {
    await authoriseIssuer(issuer.address);
    await credentialRegistry.connect(issuer).issueCredential(credHash, cidHash);
    await revocationRegistry.connect(issuer).revoke(credHash, 2); // FraudDetected

    const [status] = await credentialRegistry.verifyCredential(credHash);
    expect(status).to.equal(2); // Revoked
  });

  it("reports NOT_FOUND for unknown credentials", async function () {
    const [status] = await credentialRegistry.verifyCredential(
      ethers.keccak256(ethers.toUtf8Bytes("nope"))
    );
    expect(status).to.equal(0); // NotFound
  });

  // ---------------------------------------------------------------------------------------
  // Duplicate blockchain anchoring — a credential hash may be anchored exactly once.
  // ---------------------------------------------------------------------------------------
  describe("duplicate anchoring", function () {
    beforeEach(async function () {
      await authoriseIssuer(issuer.address);
      await credentialRegistry.connect(issuer).issueCredential(credHash, cidHash);
    });

    it("reverts when the same credHash is issued twice", async function () {
      await expect(
        credentialRegistry.connect(issuer).issueCredential(credHash, cidHash)
      ).to.be.revertedWith("Credential: already issued");
    });

    it("reverts even when a different issuer or CID re-anchors the same credHash", async function () {
      await authoriseIssuer(other.address);
      const otherCid = ethers.keccak256(ethers.toUtf8Bytes("Qm-cid-2"));
      await expect(
        credentialRegistry.connect(other).issueCredential(credHash, otherCid)
      ).to.be.revertedWith("Credential: already issued");
    });

    it("rejects a batch that contains an already-anchored credHash (all-or-nothing)", async function () {
      const fresh = ethers.keccak256(ethers.toUtf8Bytes("vc-document-2"));
      await expect(
        credentialRegistry.connect(issuer).batchIssue([fresh, credHash], [cidHash, cidHash])
      ).to.be.revertedWith("Credential: already issued");
      // The fresh hash from the failed batch must NOT have been anchored.
      const [status] = await credentialRegistry.verifyCredential(fresh);
      expect(status).to.equal(0); // NotFound
    });

    it("keeps the original record intact after a duplicate attempt", async function () {
      const before = await credentialRegistry.getCredential(credHash);
      await expect(
        credentialRegistry.connect(issuer).issueCredential(credHash, cidHash)
      ).to.be.revertedWith("Credential: already issued");
      const after = await credentialRegistry.getCredential(credHash);
      expect(after.issuer).to.equal(issuer.address);
      expect(after.issuedAt).to.equal(before.issuedAt);
      const [status] = await credentialRegistry.verifyCredential(credHash);
      expect(status).to.equal(1); // Verified
    });
  });

  // ---------------------------------------------------------------------------------------
  // Emergency pause — governance halts NEW issuance; verification of existing credentials
  // must never stop.
  // ---------------------------------------------------------------------------------------
  describe("emergency pause", function () {
    const pauseData = () => credentialRegistry.interface.encodeFunctionData("emergencyPause", []);
    const unpauseData = () => credentialRegistry.interface.encodeFunctionData("unpause", []);

    beforeEach(async function () {
      await authoriseIssuer(issuer.address);
      await credentialRegistry.connect(issuer).issueCredential(credHash, cidHash);
    });

    it("only governance (the 2-of-3 safe) can pause — a single regulator or issuer cannot", async function () {
      await expect(credentialRegistry.connect(zaqa).emergencyPause())
        .to.be.revertedWith("Credential: not governance");
      await expect(credentialRegistry.connect(issuer).emergencyPause())
        .to.be.revertedWith("Credential: not governance");
      expect(await credentialRegistry.paused()).to.equal(false);
    });

    it("blocks new issuance (single and batch) once governance calls emergencyPause()", async function () {
      await viaGovernance(await credentialRegistry.getAddress(), pauseData());
      expect(await credentialRegistry.paused()).to.equal(true);

      const fresh = ethers.keccak256(ethers.toUtf8Bytes("vc-document-2"));
      await expect(
        credentialRegistry.connect(issuer).issueCredential(fresh, cidHash)
      ).to.be.revertedWithCustomError(credentialRegistry, "EnforcedPause");
      await expect(
        credentialRegistry.connect(issuer).batchIssue([fresh], [cidHash])
      ).to.be.revertedWithCustomError(credentialRegistry, "EnforcedPause");

      const [status] = await credentialRegistry.verifyCredential(fresh);
      expect(status).to.equal(0); // NotFound — nothing slipped through
    });

    it("keeps existing credentials verifiable while paused", async function () {
      await viaGovernance(await credentialRegistry.getAddress(), pauseData());

      const [status, cred] = await credentialRegistry.verifyCredential(credHash);
      expect(status).to.equal(1); // Verified — public verification never stops
      expect(cred.issuer).to.equal(issuer.address);
      expect(cred.cidHash).to.equal(cidHash);
      expect((await credentialRegistry.getCredential(credHash)).issuedAt).to.not.equal(0n);
    });

    it("still reports revocations while paused (revocation is not gated by the pause)", async function () {
      await viaGovernance(await credentialRegistry.getAddress(), pauseData());
      await revocationRegistry.connect(issuer).revoke(credHash, 2); // FraudDetected
      const [status] = await credentialRegistry.verifyCredential(credHash);
      expect(status).to.equal(2); // Revoked
    });

    it("resumes issuance after governance unpauses", async function () {
      await viaGovernance(await credentialRegistry.getAddress(), pauseData());
      await viaGovernance(await credentialRegistry.getAddress(), unpauseData());
      expect(await credentialRegistry.paused()).to.equal(false);

      const fresh = ethers.keccak256(ethers.toUtf8Bytes("vc-document-2"));
      await credentialRegistry.connect(issuer).issueCredential(fresh, cidHash);
      const [status] = await credentialRegistry.verifyCredential(fresh);
      expect(status).to.equal(1); // Verified
    });
  });

  // ---------------------------------------------------------------------------------------
  // D01 — revocation and reissue are bound to the credential's RECORDED issuer. Being an
  // authorised issuer somewhere in the system is not enough to touch another issuer's award.
  // ---------------------------------------------------------------------------------------
  describe("issuer-scoped revocation and reissue (D01)", function () {
    const hashA = ethers.keccak256(ethers.toUtf8Bytes("award-of-issuer-A"));
    const hashA2 = ethers.keccak256(ethers.toUtf8Bytes("corrected-award-of-issuer-A"));
    const hashB = ethers.keccak256(ethers.toUtf8Bytes("award-of-issuer-B"));
    const unknown = ethers.keccak256(ethers.toUtf8Bytes("never-anchored"));

    beforeEach(async function () {
      await authoriseIssuer(issuer.address);   // issuer A
      await authoriseIssuer(issuerB.address);  // issuer B, separately authorised
      await credentialRegistry.connect(issuer).issueCredential(hashA, cidHash);
      await credentialRegistry.connect(issuerB).issueCredential(hashB, cidHash);
    });

    const status = async (h) => (await credentialRegistry.verifyCredential(h))[0];

    it("lets issuer A revoke its own award", async function () {
      await revocationRegistry.connect(issuer).revoke(hashA, 2);
      expect(await status(hashA)).to.equal(2); // Revoked
      const rev = await revocationRegistry.getRevocation(hashA);
      expect(rev.revokedBy).to.equal(issuer.address);
    });

    it("rejects issuer B revoking issuer A's award", async function () {
      await expect(revocationRegistry.connect(issuerB).revoke(hashA, 2))
        .to.be.revertedWith("Revocation: not credential issuer");
      expect(await status(hashA)).to.equal(1); // still Verified
    });

    it("rejects issuer B superseding issuer A's award, even with B's own replacement", async function () {
      await expect(revocationRegistry.connect(issuerB).reissue(hashA, hashB))
        .to.be.revertedWith("Revocation: not credential issuer");
      expect(await status(hashA)).to.equal(1);
    });

    it("rejects issuer A pointing its award at a replacement anchored by issuer B", async function () {
      await expect(revocationRegistry.connect(issuer).reissue(hashA, hashB))
        .to.be.revertedWith("Revocation: replacement not issued by caller");
    });

    it("refuses to revoke or reissue an unknown (never anchored) credential", async function () {
      await expect(revocationRegistry.connect(issuer).revoke(unknown, 1))
        .to.be.revertedWith("Revocation: unknown credential");
      await expect(revocationRegistry.connect(issuer).reissue(unknown, hashA))
        .to.be.revertedWith("Revocation: unknown credential");
    });

    it("refuses an already revoked credential (no second revocation, no reissue)", async function () {
      await revocationRegistry.connect(issuer).revoke(hashA, 4);
      await expect(revocationRegistry.connect(issuer).revoke(hashA, 2))
        .to.be.revertedWith("Revocation: already revoked");
      await credentialRegistry.connect(issuer).issueCredential(hashA2, cidHash);
      await expect(revocationRegistry.connect(issuer).reissue(hashA, hashA2))
        .to.be.revertedWith("Revocation: already revoked");
    });

    it("refuses a zero replacement and a self-replacement", async function () {
      await expect(revocationRegistry.connect(issuer).reissue(hashA, ethers.ZeroHash))
        .to.be.revertedWith("Revocation: zero replacement");
      await expect(revocationRegistry.connect(issuer).reissue(hashA, hashA))
        .to.be.revertedWith("Revocation: self replacement");
    });

    it("refuses a replacement that is not anchored yet", async function () {
      await expect(revocationRegistry.connect(issuer).reissue(hashA, hashA2))
        .to.be.revertedWith("Revocation: replacement not issued by caller");
    });

    it("supersedes an award with the issuer's own anchored replacement and links both", async function () {
      await credentialRegistry.connect(issuer).issueCredential(hashA2, cidHash);
      await expect(revocationRegistry.connect(issuer).reissue(hashA, hashA2))
        .to.emit(revocationRegistry, "CredentialReissued");
      expect(await status(hashA)).to.equal(2);  // old: Revoked
      expect(await status(hashA2)).to.equal(1); // new: Verified
      expect((await revocationRegistry.getRevocation(hashA)).supersededBy).to.equal(hashA2);
      expect(await revocationRegistry.supersedes(hashA2)).to.equal(hashA);
    });

    it("refuses a duplicate successor (one replacement cannot supersede two awards)", async function () {
      const hashA3 = ethers.keccak256(ethers.toUtf8Bytes("second-award-of-issuer-A"));
      await credentialRegistry.connect(issuer).issueCredential(hashA2, cidHash);
      await credentialRegistry.connect(issuer).issueCredential(hashA3, cidHash);
      await revocationRegistry.connect(issuer).reissue(hashA, hashA2);
      await expect(revocationRegistry.connect(issuer).reissue(hashA3, hashA2))
        .to.be.revertedWith("Revocation: duplicate successor");
    });

    it("refuses a revoked replacement", async function () {
      await credentialRegistry.connect(issuer).issueCredential(hashA2, cidHash);
      await revocationRegistry.connect(issuer).revoke(hashA2, 1);
      await expect(revocationRegistry.connect(issuer).reissue(hashA, hashA2))
        .to.be.revertedWith("Revocation: replacement revoked");
    });

    it("rejects revocation by accounts that are not authorised issuers", async function () {
      await expect(revocationRegistry.connect(other).revoke(hashA, 2))
        .to.be.revertedWith("Revocation: not authorised issuer");
    });

    describe("administrative emergency revocation", function () {
      const emergencyData = (h, code) => revocationRegistry.interface.encodeFunctionData("governanceRevoke", [h, code]);

      it("lets 2-of-3 governance revoke any issuer's award", async function () {
        await viaGovernance(await revocationRegistry.getAddress(), emergencyData(hashA, 3));
        expect(await status(hashA)).to.equal(2);
        const rev = await revocationRegistry.getRevocation(hashA);
        expect(rev.reasonCode).to.equal(3); // RegulatoryAction
        expect(rev.revokedBy).to.equal(await safe.getAddress());
      });

      it("is not available to a single regulator or an issuer", async function () {
        await expect(revocationRegistry.connect(zaqa).governanceRevoke(hashA, 3))
          .to.be.revertedWith("Revocation: not governance");
        await expect(revocationRegistry.connect(issuerB).governanceRevoke(hashA, 3))
          .to.be.revertedWith("Revocation: not governance");
      });

      it("still refuses unknown credentials and the NotRevoked reason", async function () {
        await expect(viaGovernance(await revocationRegistry.getAddress(), emergencyData(unknown, 3)))
          .to.be.revertedWith("Safe: call failed");
        await expect(viaGovernance(await revocationRegistry.getAddress(), emergencyData(hashA, 0)))
          .to.be.revertedWith("Safe: call failed");
        expect(await status(hashA)).to.equal(1);
      });

      it("keeps working after the issuer has lost its authorisation", async function () {
        const data = issuerRegistry.interface.encodeFunctionData("revokeIssuerRole", [issuer.address]);
        await viaGovernance(await issuerRegistry.getAddress(), data);
        await expect(revocationRegistry.connect(issuer).revoke(hashA, 2))
          .to.be.revertedWith("Revocation: not authorised issuer");
        await viaGovernance(await revocationRegistry.getAddress(), emergencyData(hashA, 2));
        expect((await revocationRegistry.getRevocation(hashA)).reasonCode).to.equal(2);
      });
    });

    describe("registry binding", function () {
      it("can be bound only once, and only by the deployer", async function () {
        await expect(revocationRegistry.bindCredentialRegistry(other.address))
          .to.be.revertedWith("Revocation: already bound");
        const RevocationRegistry = await ethers.getContractFactory("RevocationRegistry");
        const fresh = await RevocationRegistry.deploy(await issuerRegistry.getAddress(), await safe.getAddress());
        await expect(fresh.connect(other).bindCredentialRegistry(other.address))
          .to.be.revertedWith("Revocation: not deployer");
        await expect(fresh.connect(issuer).revoke(hashA, 1))
          .to.be.revertedWith("Revocation: registry not bound");
      });
    });
  });
});
