import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-travel-schema-"));
process.env.DB_PATH = path.join(tmpDir, "travel-schema.db");

const { db, migrate } = await import("../db.js");

try {
  migrate();

  const travelLeadColumns = db.prepare("PRAGMA table_info(travel_leads)").all().map((column) => column.name);
  const travelPropertyColumns = db.prepare("PRAGMA table_info(travel_properties)").all().map((column) => column.name);
  const travelInquiryColumns = db.prepare("PRAGMA table_info(travel_property_inquiries)").all().map((column) => column.name);
  const travelPhotoColumns = db.prepare("PRAGMA table_info(travel_property_photos)").all().map((column) => column.name);
  const travelRoomColumns = db.prepare("PRAGMA table_info(travel_property_rooms)").all().map((column) => column.name);
  const travelRoomRatePeriodColumns = db.prepare("PRAGMA table_info(travel_property_room_rate_periods)").all().map((column) => column.name);
  const travelCalendarColumns = db.prepare("PRAGMA table_info(travel_property_calendar_links)").all().map((column) => column.name);
  const travelCalendarBlockColumns = db.prepare("PRAGMA table_info(travel_property_calendar_blocks)").all().map((column) => column.name);
  const travelBookingRequestColumns = db.prepare("PRAGMA table_info(travel_booking_requests)").all().map((column) => column.name);
  const travelActivityColumns = db.prepare("PRAGMA table_info(travel_lead_activities)").all().map((column) => column.name);
  const travelOwnerResetTokenColumns = db.prepare("PRAGMA table_info(travel_owner_password_reset_tokens)").all().map((column) => column.name);
  const travelScoringColumns = db.prepare("PRAGMA table_info(travel_scoring_settings)").all().map((column) => column.name);
  const travelTemplateColumns = db.prepare("PRAGMA table_info(travel_content_templates)").all().map((column) => column.name);
  const travelJobColumns = db.prepare("PRAGMA table_info(travel_content_jobs)").all().map((column) => column.name);
  const travelArticleColumns = db.prepare("PRAGMA table_info(travel_blog_articles)").all().map((column) => column.name);
  const travelPostColumns = db.prepare("PRAGMA table_info(travel_social_posts)").all().map((column) => column.name);
  const travelSocialAccountColumns = db.prepare("PRAGMA table_info(travel_social_accounts)").all().map((column) => column.name);
  const travelPublishJobColumns = db.prepare("PRAGMA table_info(travel_social_publish_jobs)").all().map((column) => column.name);
  const travelEmailColumns = db.prepare("PRAGMA table_info(travel_email_messages)").all().map((column) => column.name);

  for (const column of [
    "id",
    "company_id",
    "name",
    "property_type",
    "country",
    "city",
    "county",
    "address",
    "phone",
    "email",
    "website",
    "facebook",
    "instagram",
    "linkedin",
    "contact_page_url",
    "contact_person",
    "google_rating",
    "google_reviews",
    "google_place_id",
    "source",
    "status",
    "score",
    "notes",
    "next_follow_up_at",
    "created_at",
    "updated_at"
  ]) {
    assert.ok(travelLeadColumns.includes(column), `travel_leads.${column}`);
  }

  for (const column of [
    "id",
    "company_id",
    "lead_id",
    "name",
    "property_type",
    "country",
    "city",
    "county",
    "address",
	    "phone",
	    "email",
	    "website",
	    "google_place_id",
	    "status",
	    "partner_plan",
	    "subscription_status",
	    "monthly_price_ron",
	    "free_until",
	    "activation_source",
	    "created_at",
	    "updated_at"
	  ]) {
    assert.ok(travelPropertyColumns.includes(column), `travel_properties.${column}`);
  }

  for (const column of [
    "id",
    "company_id",
    "property_id",
    "token_hash",
    "account_email",
    "requested_by_email",
    "requested_source",
    "expires_at",
    "used_at",
    "created_at"
  ]) {
    assert.ok(travelOwnerResetTokenColumns.includes(column), `travel_owner_password_reset_tokens.${column}`);
  }

  for (const column of [
    "id",
    "company_id",
    "property_id",
    "property_name",
    "guest_name",
    "phone",
    "email",
    "check_in",
    "check_out",
    "guests",
    "message",
    "source",
    "status",
    "notified_at",
    "notification_error",
    "created_at",
    "updated_at"
  ]) {
    assert.ok(travelInquiryColumns.includes(column), `travel_property_inquiries.${column}`);
  }

  for (const column of [
    "id",
    "company_id",
    "property_id",
    "file_path",
    "public_url",
    "room_id",
    "room_name",
    "caption",
    "sort_order",
    "is_cover",
    "created_at",
    "updated_at"
  ]) {
    assert.ok(travelPhotoColumns.includes(column), `travel_property_photos.${column}`);
  }

  for (const column of [
    "id",
    "company_id",
    "property_id",
    "name",
    "description",
    "beds",
    "amenities",
    "size_sqm",
    "max_adults",
    "max_children",
    "quantity",
    "price_per_night",
    "price_currency",
    "external_provider",
    "external_room_id",
    "external_rate_plan_id",
    "sort_order",
    "status",
    "created_at",
    "updated_at"
  ]) {
    assert.ok(travelRoomColumns.includes(column), `travel_property_rooms.${column}`);
  }

  for (const column of [
    "id",
    "company_id",
    "property_id",
    "room_id",
    "room_name",
    "start_date",
    "end_date",
    "price_per_night",
    "price_currency",
    "available_quantity",
    "status",
    "source",
    "external_provider",
    "external_room_id",
    "external_rate_plan_id",
    "notes",
    "created_at",
    "updated_at"
  ]) {
    assert.ok(travelRoomRatePeriodColumns.includes(column), `travel_property_room_rate_periods.${column}`);
  }

  for (const column of [
    "id",
    "company_id",
    "property_id",
    "provider",
    "calendar_url",
    "sync_status",
    "last_synced_at",
    "last_error",
    "created_at",
    "updated_at"
  ]) {
    assert.ok(travelCalendarColumns.includes(column), `travel_property_calendar_links.${column}`);
  }

  for (const column of [
    "id",
    "company_id",
    "property_id",
    "calendar_link_id",
    "booking_request_id",
    "block_date",
    "source",
    "summary",
    "hold_expires_at",
    "created_at",
    "updated_at"
  ]) {
    assert.ok(travelCalendarBlockColumns.includes(column), `travel_property_calendar_blocks.${column}`);
  }

  for (const column of [
    "id",
    "company_id",
    "property_id",
    "property_name",
    "guest_name",
    "phone",
    "email",
    "check_in",
    "check_out",
    "nights",
    "guests",
    "adults",
    "children",
    "child_ages",
    "meal_type",
    "message",
    "source",
    "booking_channel",
    "availability_provider",
    "payment_flow",
    "external_provider",
    "external_reservation_id",
    "pynbooking_reservation_id",
    "external_reservation_status",
    "external_error",
    "status",
    "price_per_night",
    "estimated_total",
    "hold_expires_at",
    "owner_notified_at",
    "owner_email_status",
    "owner_email_error",
    "owner_whatsapp_status",
    "owner_whatsapp_url",
    "accepted_at",
    "declined_at",
    "payment_due_at",
    "created_at",
    "updated_at"
  ]) {
    assert.ok(travelBookingRequestColumns.includes(column), `travel_booking_requests.${column}`);
  }

  for (const column of [
    "id",
    "company_id",
    "lead_id",
    "activity_type",
    "subject",
    "details",
    "created_at"
  ]) {
    assert.ok(travelActivityColumns.includes(column), `travel_lead_activities.${column}`);
  }

  for (const column of [
    "id",
    "company_id",
    "phone_points",
    "email_points",
    "website_points",
    "social_points",
    "google_reviews_50_points",
    "google_reviews_200_points",
    "tourist_city_points",
    "tourist_cities",
    "created_at",
    "updated_at"
  ]) {
    assert.ok(travelScoringColumns.includes(column), `travel_scoring_settings.${column}`);
  }

  for (const column of [
    "id",
    "company_id",
    "template_type",
    "name",
    "prompt",
    "tone",
    "status",
    "created_at",
    "updated_at"
  ]) {
    assert.ok(travelTemplateColumns.includes(column), `travel_content_templates.${column}`);
  }

  for (const column of [
    "id",
    "company_id",
    "property_id",
    "job_type",
    "status",
    "prompt",
    "result_summary",
    "model",
    "error",
    "created_at",
    "updated_at"
  ]) {
    assert.ok(travelJobColumns.includes(column), `travel_content_jobs.${column}`);
  }

  for (const column of [
    "id",
    "company_id",
    "property_id",
    "job_id",
    "title",
    "slug",
    "meta_title",
    "meta_description",
    "content",
    "keywords",
    "category",
    "status",
    "created_at",
    "updated_at"
  ]) {
    assert.ok(travelArticleColumns.includes(column), `travel_blog_articles.${column}`);
  }

  for (const column of [
    "id",
    "company_id",
    "property_id",
    "job_id",
    "platform",
    "content_type",
    "caption",
    "hashtags",
    "media_url",
    "status",
    "scheduled_at",
    "created_at",
    "updated_at"
  ]) {
    assert.ok(travelPostColumns.includes(column), `travel_social_posts.${column}`);
  }

  for (const column of [
    "id",
    "company_id",
    "platform",
    "account_name",
    "account_handle",
    "external_id",
    "page_id",
    "posting_mode",
    "auto_publish",
    "access_token",
    "refresh_token",
    "token_expires_at",
    "refresh_expires_at",
    "scopes",
    "profile_json",
    "last_sync_at",
    "status",
    "created_at",
    "updated_at"
  ]) {
    assert.ok(travelSocialAccountColumns.includes(column), `travel_social_accounts.${column}`);
  }

  for (const column of [
    "id",
    "company_id",
    "lead_id",
    "mailbox",
    "direction",
    "provider_message_id",
    "from_email",
    "to_email",
    "subject",
    "text_body",
    "detected_language",
    "detected_language_name",
    "translation_ro",
    "translation_status",
    "translation_model",
    "translation_updated_at",
    "reply_language",
    "reply_language_name",
    "received_at",
    "created_at"
  ]) {
    assert.ok(travelEmailColumns.includes(column), `travel_email_messages.${column}`);
  }

  for (const column of [
    "id",
    "company_id",
    "social_post_id",
    "account_id",
    "platform",
    "status",
    "scheduled_at",
    "published_at",
    "external_post_id",
    "error",
    "response_json",
    "created_at",
    "updated_at"
  ]) {
    assert.ok(travelPublishJobColumns.includes(column), `travel_social_publish_jobs.${column}`);
  }

  const companyId = Number(db.prepare(`
    INSERT INTO companies (name, slug, status, max_users, created_at, updated_at)
    VALUES ('Travel Schema Test', 'travel-schema-test', 'active', 1, datetime('now'), datetime('now'))
  `).run().lastInsertRowid);

  const leadId = Number(db.prepare(`
    INSERT INTO travel_leads (
      company_id, name, property_type, city, county, phone, email, google_rating,
      google_reviews, source, status, score, notes, next_follow_up_at
    )
    VALUES (?, 'Hotel Demo', 'hotel', 'Brașov', 'Brașov', '0700000000', 'hotel@example.test', 4.7, 128, 'manual', 'nou', 42, 'lead test', datetime('now'))
  `).run(companyId).lastInsertRowid);

  assert.ok(leadId > 0);

  const propertyId = Number(db.prepare(`
    INSERT INTO travel_properties (
      company_id, lead_id, name, property_type, city, county, phone, email, website, status
    )
    VALUES (?, ?, 'Hotel Demo Activ', 'hotel', 'Brașov', 'Brașov', '0700000000', 'hotel@example.test', 'https://example.test', 'activ')
  `).run(companyId, leadId).lastInsertRowid);

  assert.ok(propertyId > 0);

  const roomId = Number(db.prepare(`
    INSERT INTO travel_property_rooms (
      company_id, property_id, name, description, beds, amenities, size_sqm,
      max_adults, max_children, quantity, price_per_night, price_currency, sort_order, status
    )
    VALUES (?, ?, 'Camera dubla standard', 'Schema test room', '1 pat dublu',
      'wifi,private-bathroom', 20, 2, 1, 4, 250, 'RON', 1, 'active')
  `).run(companyId, propertyId).lastInsertRowid);
  assert.ok(roomId > 0);

  const roomRatePeriodId = Number(db.prepare(`
    INSERT INTO travel_property_room_rate_periods (
      company_id, property_id, room_id, room_name, start_date, end_date,
      price_per_night, price_currency, available_quantity, status, source, notes
    )
    VALUES (?, ?, ?, 'Camera dubla standard', '2026-08-01', '2026-08-10',
      320, 'RON', 2, 'available', 'manual', 'schema test')
  `).run(companyId, propertyId, roomId).lastInsertRowid);
  assert.ok(roomRatePeriodId > 0);

  const inquiryId = Number(db.prepare(`
    INSERT INTO travel_property_inquiries (
      company_id, property_id, property_name, guest_name, phone, email, check_in, check_out,
      guests, message, source, status
    )
    VALUES (?, ?, 'Hotel Demo Activ', 'Client Demo', '0711111111', 'client@example.test', '2026-07-01', '2026-07-03', 2, 'schema test', 'trevoro_site', 'nou')
  `).run(companyId, propertyId).lastInsertRowid);
  assert.ok(inquiryId > 0);

  const bookingRequestId = Number(db.prepare(`
    INSERT INTO travel_booking_requests (
      company_id, property_id, property_name, guest_name, phone, email,
      check_in, check_out, nights, guests, adults, children, child_ages,
      meal_type, message, source, status, price_per_night, estimated_total,
      hold_expires_at, owner_email_status, owner_whatsapp_status, owner_whatsapp_url
    )
    VALUES (?, ?, 'Hotel Demo Activ', 'Client Rezervare', '0711111112', 'booking@example.test',
      '2026-07-10', '2026-07-12', 2, 3, 2, 1, '7', 'mic_dejun',
      'booking schema test', 'trevoro_www', 'pending', 520, 1040,
      datetime('now', '+24 hours'), 'sent', 'prepared', 'https://wa.me/40700000000')
  `).run(companyId, propertyId).lastInsertRowid);
  assert.ok(bookingRequestId > 0);

  const bookingHoldId = Number(db.prepare(`
    INSERT INTO travel_property_calendar_blocks (
      company_id, property_id, calendar_link_id, booking_request_id, block_date,
      source, summary, hold_expires_at
    )
    VALUES (?, ?, NULL, ?, '2026-07-10', 'booking_hold', 'Cerere rezervare test', datetime('now', '+24 hours'))
  `).run(companyId, propertyId, bookingRequestId).lastInsertRowid);
  assert.ok(bookingHoldId > 0);

  const photoId = Number(db.prepare(`
    INSERT INTO travel_property_photos (
      company_id, property_id, file_path, public_url, caption, sort_order, is_cover
    )
    VALUES (?, ?, 'uploads/travel/demo.jpg', '/uploads/travel/demo.jpg', 'Fațadă', 1, 1)
  `).run(companyId, propertyId).lastInsertRowid);
  assert.ok(photoId > 0);

  const calendarId = Number(db.prepare(`
    INSERT INTO travel_property_calendar_links (
      company_id, property_id, provider, calendar_url, sync_status
    )
    VALUES (?, ?, 'ical', 'https://example.test/calendar.ics', 'pending')
  `).run(companyId, propertyId).lastInsertRowid);
  assert.ok(calendarId > 0);

  const activityId = Number(db.prepare(`
    INSERT INTO travel_lead_activities (company_id, lead_id, activity_type, subject, details)
    VALUES (?, ?, 'note_added', 'Notă adăugată', 'schema test')
  `).run(companyId, leadId).lastInsertRowid);
  assert.ok(activityId > 0);

  const scoringId = Number(db.prepare(`
    INSERT INTO travel_scoring_settings (
      company_id, phone_points, email_points, website_points, social_points,
      google_reviews_50_points, google_reviews_200_points, tourist_city_points, tourist_cities
    )
    VALUES (?, 20, 20, 15, 10, 10, 20, 10, '["Brașov"]')
  `).run(companyId).lastInsertRowid);
  assert.ok(scoringId > 0);

  const templateId = Number(db.prepare(`
    INSERT INTO travel_content_templates (company_id, template_type, name, prompt, tone, status)
    VALUES (?, 'seo_article', 'SEO demo', 'Scrie articol SEO', 'cald', 'activ')
  `).run(companyId).lastInsertRowid);
  assert.ok(templateId > 0);

  const jobId = Number(db.prepare(`
    INSERT INTO travel_content_jobs (company_id, property_id, job_type, status, prompt, result_summary, model)
    VALUES (?, ?, 'seo_article', 'generated', 'prompt demo', 'rezumat demo', 'local_fallback')
  `).run(companyId, propertyId).lastInsertRowid);
  assert.ok(jobId > 0);

  const articleId = Number(db.prepare(`
    INSERT INTO travel_blog_articles (
      company_id, property_id, job_id, title, slug, meta_title, meta_description, content, keywords, category, status
    )
    VALUES (?, ?, ?, 'Top cazare Brașov', 'top-cazare-brasov', 'Top cazare Brașov', 'Meta demo', 'Conținut demo', 'cazare Brașov', 'Ghiduri', 'draft')
  `).run(companyId, propertyId, jobId).lastInsertRowid);
  assert.ok(articleId > 0);

  const postId = Number(db.prepare(`
    INSERT INTO travel_social_posts (
      company_id, property_id, job_id, platform, content_type, caption, hashtags, status
    )
    VALUES (?, ?, ?, 'facebook', 'facebook_post', 'Post demo', '#Trevoro', 'draft')
  `).run(companyId, propertyId, jobId).lastInsertRowid);
  assert.ok(postId > 0);

  const accountId = Number(db.prepare(`
    INSERT INTO travel_social_accounts (
      company_id, platform, account_name, account_handle, external_id, page_id, posting_mode, auto_publish, status
    )
    VALUES (?, 'facebook', 'Trevoro România', 'facebook.com/profile.php?id=61590311832249', '61590311832249', '61590311832249', 'api', 1, 'setup_required')
  `).run(companyId).lastInsertRowid);
  assert.ok(accountId > 0);

  const publishJobId = Number(db.prepare(`
    INSERT INTO travel_social_publish_jobs (
      company_id, social_post_id, account_id, platform, status, error
    )
    VALUES (?, ?, ?, 'facebook', 'manual_required', 'token lipsă')
  `).run(companyId, postId, accountId).lastInsertRowid);
  assert.ok(publishJobId > 0);

  assert.throws(() => {
    db.prepare(`
      INSERT INTO travel_leads (company_id, name, status)
      VALUES (?, 'Status invalid', 'invalid')
    `).run(companyId);
  }, /CHECK constraint failed/);

  assert.throws(() => {
    db.prepare(`
      INSERT INTO travel_content_jobs (company_id, property_id, job_type, status)
      VALUES (?, ?, 'invalid', 'generated')
    `).run(companyId, propertyId);
  }, /CHECK constraint failed/);

  console.log("travel schema tests passed");
} finally {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
