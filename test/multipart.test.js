import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMultipart } from "../src/multipart.js";

describe("multipart", () => {
  it("extracts named file parts", () => {
    const body = Buffer.from(
      [
        "--abc",
        'Content-Disposition: form-data; name="office"; filename="a.pdf"',
        "Content-Type: application/pdf",
        "",
        "%PDF",
        "--abc",
        'Content-Disposition: form-data; name="crewmeister"; filename="b.xlsx"',
        "",
        "PK",
        "--abc--",
        "",
      ].join("\r\n"),
    );
    const files = parseMultipart(body, "multipart/form-data; boundary=abc");
    assert.equal(files.office[0].filename, "a.pdf");
    assert.equal(files.office[0].buffer.toString(), "%PDF");
    assert.equal(files.crewmeister[0].buffer.toString(), "PK");
  });

  it("keeps several crewmeister parts", () => {
    const body = Buffer.from(
      [
        "--abc",
        'Content-Disposition: form-data; name="crewmeister"; filename="aug.xlsx"',
        "",
        "AUG",
        "--abc",
        'Content-Disposition: form-data; name="crewmeister"; filename="sep.xlsx"',
        "",
        "SEP",
        "--abc--",
        "",
      ].join("\r\n"),
    );
    const files = parseMultipart(body, "multipart/form-data; boundary=abc");
    assert.equal(files.crewmeister.length, 2);
    assert.equal(files.crewmeister[0].filename, "aug.xlsx");
    assert.equal(files.crewmeister[1].filename, "sep.xlsx");
  });
});
