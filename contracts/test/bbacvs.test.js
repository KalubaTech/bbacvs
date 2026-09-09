const { expect } = require("chai");
const { ethers } = require("hardhat");

// End-to-end exercise of the on-chain stack: governance -> issuer reg -> issue -> verify -> revoke.
describe("BBACVS on-chain stack", function () {
  let safe, issuerRegistry, revocationRegistry, credentialRegistry;
  let zaqa, ecz, hea, issuer, other;

  const DID = ethers.encodeBytes32String("did:ethr:unza");
  const INSTITUTION = ethers.encodeBytes32String("UNZA");
  const credHash = ethers.keccak256(ethers.toUtf8Bytes("vc-document-1"));
  const cidHash = ethers.keccak256(ethers.toUtf8Bytes("Qm-cid-1"));

  beforeEach(async function () {
    [zaqa, ecz, hea, issuer, other] = await ethers.getSigners();

    const Safe = await ethers.getContractFactory("GovernanceSafe");
    safe = await Safe.deploy([zaqa.address, ecz.address, hea.address], 2);

    const IssuerRegistry = await ethers.getContractFactory("IssuerRegistry");
    issuerRegistry = await IssuerRegistry.deploy(await safe.getAddress());

    const RevocationRegistry = await ethers.getContractFactory("RevocationRegistry");
    revocationRegistry = await RevocationRegistry.deploy(await issuerRegistry.getAddress());

    const CredentialRegistry = await ethers.getContractFactory("CredentialRegistry");
    credentialRegistry = await CredentialRegistry.deploy(
      await issuerRegistry.getAddress(),
      await revocationRegistry.getAddress(),
      await safe.getAddress()
    );
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
});
