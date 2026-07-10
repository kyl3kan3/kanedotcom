import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

test("authenticated Server Action POSTs reach their server-side authorization", async () => {
  const request = new NextRequest("https://kanedotcom.com/account/settings", {
    method: "POST",
    headers: {
      "next-action": "family-member-save",
    },
  });

  const response = await proxy(request);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.equal(response.headers.get("location"), null);
});
