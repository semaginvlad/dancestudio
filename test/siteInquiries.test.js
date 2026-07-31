import test from "node:test";
import assert from "node:assert/strict";
import {
  canEditSiteInquiry,
  filterSiteInquiries,
  getSiteInquiryContactLinks,
  mapSiteInquiry,
  SITE_INQUIRY_EDITABLE_STATUSES,
  validateSiteInquiryModel,
} from "../src/shared/siteInquiries.js";

test("maps the database row without leaking unknown payload fields", () => {
  const result = mapSiteInquiry({
    id: "0198d42e-4fc2-7000-8000-000000000001",
    status: "in_progress",
    name: "  Марія  ",
    phone: " +380 67 123 45 67 ",
    direction_name_snapshot: " Bachata ",
    submission_count: 2,
    ip_address: "must-not-leak",
    turnstile_token: "must-not-leak",
  });

  assert.equal(result.name, "Марія");
  assert.equal(result.directionName, "Bachata");
  assert.equal(result.submissionCount, 2);
  assert.equal("ip_address" in result, false);
  assert.equal("turnstile_token" in result, false);
});

test("only V1 operational statuses are editable", () => {
  for (const status of SITE_INQUIRY_EDITABLE_STATUSES) {
    assert.equal(canEditSiteInquiry({ status }), true);
  }
  assert.equal(canEditSiteInquiry({ status: "converted_to_trial" }), false);
  assert.equal(canEditSiteInquiry({ status: "converted_to_student" }), false);
});

test("creates safe contact links from normalized contacts", () => {
  assert.deepEqual(getSiteInquiryContactLinks({
    phoneNormalized: "+380671234567",
    emailNormalized: "hello@example.com",
    telegram: "@dance_studio",
    instagram: "https://instagram.com/soroka.dance/",
  }), {
    phone: "tel:+380671234567",
    email: "mailto:hello@example.com",
    telegram: "https://t.me/dance_studio",
    instagram: "https://instagram.com/soroka.dance",
  });
});

test("validates required contact and conversion consistency", () => {
  assert.deepEqual(validateSiteInquiryModel({ name: "Марія", status: "new" }), {
    valid: false,
    errors: ["contact_required"],
  });
  assert.equal(validateSiteInquiryModel({ name: "Марія", phone: "+38067", status: "new" }).valid, true);
  assert.deepEqual(validateSiteInquiryModel({ name: "Марія", email: "m@example.com", status: "converted_to_trial" }).errors, ["conversion_id_required"]);
  assert.equal(validateSiteInquiryModel({ name: "Марія", email: "m@example.com", status: "converted_to_trial", convertedTrialBookingId: "id" }).valid, true);
});

test("filters inquiries by status and searchable CRM fields", () => {
  const rows = [
    { id: "1", status: "new", name: "Марія", directionName: "Bachata" },
    { id: "2", status: "closed", name: "Олена", comment: "High Heels" },
  ];
  assert.deepEqual(filterSiteInquiries(rows, { status: "new", search: "bachata" }).map((row) => row.id), ["1"]);
  assert.deepEqual(filterSiteInquiries(rows, { status: "all", search: "heels" }).map((row) => row.id), ["2"]);
});
