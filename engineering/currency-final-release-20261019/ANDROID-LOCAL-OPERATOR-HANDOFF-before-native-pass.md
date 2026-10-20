# Android local acceptance - operator action required

Connected Samsung SM_S938U, serial R5CY23FMCCD. Expo Go54.0.6 detected. USB reverse55625 (local Auth-validated financial bridge) and55627 (local Expo Metro) configured. No APK installed, no EAS project created, no Production financial RPC or deployment.

Open Expo Go, enter exp://127.0.0.1:55627, sign in privately with the approved Owner. Source entry: native-acceptance/index.tsx. Public Auth targets the existing project; every financial RPC is restricted to saved disposable local fixtures through127.0.0.1:55625. Existing Production activation flags remain off.

First action requested: TZS Original refund, quantity1, reference NATIVE-TZS-PDF, post once, then Share refund PDF. Confirm actual receipt and native share sheet. Other currencies each retain one original unit after browser acceptance. Use NATIVE-<currency>-PDF references. Do not resend a request with a different id if its result is uncertain; use Retry saved refund. Historical insufficient evidence remains denied.

Native runtime, receipt generation and sharing are PENDING; build/device connectivity are not physical acceptance PASS. Native entry is an isolated actual-source acceptance surface, not certification of deployed app navigation. No automated Android UI control is available in this session; the operator must perform the physical actions.

Servers are intentionally running for acceptance. For a later safe shutdown: verify/stop the Node acceptance parent, run stop_acceptance_databases.py to disable both local rollout flags and fast-stop only its exact recorded PostgreSQL clusters; stop the native Metro parent/child recorded in local process evidence. Preserve both runtime directories, Auth storage and pending requests.
