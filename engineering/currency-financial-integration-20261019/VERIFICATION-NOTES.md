# Verification notes

Final results supersede resolved attempt failures; none caused remote writes:
- Initial PostgreSQL probe was blocked by sandbox loopback access; local-only execution succeeded outside sandbox.
- Initial SQL fixture expected TZS, while preserved synthetic fixture was USD. A fresh disposable copy explicitly substituted TZS under local test-only trigger suspension; original source/Production authority was untouched. Native denial substitutions were transaction-local and rolled back.
- Initial rendered assertion expected a decimal point in French. Assertion was corrected to locale-specific formatting; application amount was already correct. Final 14 language/viewport combinations passed.
- Sandbox blocked Edge temporary profile and Expo asset directory creation. Affected commands succeeded with required execution permission.
- Initial TypeScript checks identified an incorrect Language type import and nullable currency interpolation. Both source issues were corrected; final diagnostics are zero.

No canary work was rerun. No connection to Staging, no new paid infrastructure, no customer writes, no Android install or deployment. Test role grants/authority substitutions were confined to stopped disposable PostgreSQL copies. Do not mistake those synthetic JWT tests for genuine Supabase Auth evidence.
