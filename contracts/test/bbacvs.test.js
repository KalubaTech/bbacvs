const { expect } = require("chai");
const { ethers } = require("hardhat");

// End-to-end exercise of the on-chain stack: governance -> issuer reg -> issue -> verify -> revoke.
describe("BBACVS on-chain stack", function () {
  let safe, issuerRegistry, revocationRegistry, credentialRegistry;
  let zqa, ecz, hea, issuer, other;

  const DID = ethers.encodeBytes32String("did:ethr:unza");
  const INSTITUTION = ethers.encodeBytes32String("UNZA");
  const credHash = ethers.keccak256(ethers.toUtf8Bytes("vc-document-1"));
  const cidHash = ethers.keccak256(ethers.toUtf8Bytes("Qm-cid-1"));

  beforeEach(async function () {
    [zqa, ecz, hea, issuer, other] = await ethers.getSigners();

    const Safe = await ethers.getContractFactory("GovernanceSafe");
    safe = await Safe.deploy([zqa.address, ecz.address, hea.address], 2);

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

  // Helper: register an issuer through a 2-of-3 multi-sig proposal+confirm.
  async function authoriseIssuer(account) {
    const data = issuerRegistry.interface.encodeFunctionData("grantIssuerRole", [
      account,
      DID,
      INSTITUTION,
    ]);
    await safe.connect(zqa).proposeTransaction(await issuerRegistry.getAddress(), 0, data); // 1st confirm
    await safe.connect(ecz).confirmTransaction(0); // 2nd confirm -> auto-executes
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
});
