# Historical public-file privacy — verified investigation

No hosted records, storage objects, permissions or functions were changed. No customer document body or customer message text was downloaded. Hosted SQL used explicit READ ONLY transactions; HTTP probes were HEAD requests without authorization.

## Verified findings

- 705 objects across three existing public buckets. `club-media` contains four PDFs, one DOCX, 163 JPEGs and one video; organization logos and product images contain 536 images combined.
- All five document URLs returned unauthenticated HTTP 200 with their expected content types. Public reports contain only hashed object names; exact identifiers remain in ignored local metadata.
- Meeting messages have six attachment URLs, all using public storage URLs. Two PDFs and the DOCX match existing meeting attachment references. The other two PDFs were not matched by that query; purpose and confidentiality are unknown. MIME type alone does not prove financial confidentiality.
- Current client upload code in `app/(tabs)/settings/meeting-room-detail.tsx:1848` stores meeting media in `club-media`, calls `getPublicUrl`, and saves that public URL. A random path is a bearer locator, not access authorization. Message expiry does not revoke a storage URL.
- Captured hosted `get_meeting_room_messages_v7(uuid)` is owned by postgres, SECURITY DEFINER, executable by PUBLIC/anon/authenticated, and filters only by room ID. Its uses of auth.uid() compute reactions, not room authorization. Caller room/organization membership is not checked in that definition.
- The exact captured reader was reproduced through real local PostgREST. Anonymous, a fresh signed-in user with no membership, and a fresh signed-in Owner of another organization each received HTTP 200 and the synthetic private message/attachment. This is a confirmed local failure, not a claim of executed hosted message exfiltration. Earlier expired-token probes were excluded.
- Existing `get_public_receipt_v1` intentionally exposes receipt amounts, customer contact fields and selling-price items by sale UUID; the captured definition does not include acquisition cost/COGS. This requires an explicit public-receipt privacy decision, not automatic conversion into an Owner-only receipt or revocation of legitimate customer receipts.

## Containment proposal requiring separate Owner authorization

1. Approve a targeted containment scope for message/attachment discovery and historical confidential files. Preserve Catalog, public product images, logos and approved public customer receipts.
2. Locally prepare and verify a narrow message-reader guard using the existing canonical room membership/invitation rules, active identities and organization boundaries. Guard reply/attachment and alternate reader paths as well; remove anonymous execute. Do not invent a second membership engine or assume Owner-only access for all legitimate room participants.
3. Classify the five documents privately with their owners. Do not infer confidentiality from MIME type or move every public media object indiscriminately.
4. Use existing Supabase Storage with a private document namespace/bucket and authenticated, scoped retrieval or short-lived authorized links. Public buckets bypass object SELECT RLS for public downloads; changing RLS alone cannot contain these five public URLs. No new paid infrastructure is required.
5. Prepare an exact object/reference manifest, backup, integrity hashes, atomic/idempotent reference transition, and verification/rollback plan. Remove or revoke original public URLs and address CDN caches only after the approved reference transition. A rollback must not silently make confidential originals public again.
6. Verify approved participants, former/inactive members, unrelated organizations, anonymous access, expired messages/links, mobile/PDF sharing, and unchanged public Catalog/media. Record residual cache exposure honestly; deletion does not recall copies already downloaded.

No containment migration, new storage bucket, hosted permission change, object move/deletion, or production publication was executed. This proposal is for Owner review; it is not an approved runnable Production package.
