// Gives an existing account (e.g. one made with an email link) a password, without
// any email. Put these two lines in .env, run the script, then delete them:
//
//   RAFIQ_ACCOUNT_EMAIL=you@example.com
//   RAFIQ_ACCOUNT_PASSWORD=your-new-password   (8+ characters)
//
//   npm run account:set-password
import { createClient } from "@supabase/supabase-js";

const email = process.env.RAFIQ_ACCOUNT_EMAIL?.trim().toLowerCase();
const password = process.env.RAFIQ_ACCOUNT_PASSWORD;
if (!email || !password) {
  console.error("Add RAFIQ_ACCOUNT_EMAIL and RAFIQ_ACCOUNT_PASSWORD to .env first.");
  process.exit(1);
}
if (password.length < 8) {
  console.error("RAFIQ_ACCOUNT_PASSWORD must be at least 8 characters.");
  process.exit(1);
}

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
let user;
for (let page = 1; !user; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  user = data.users.find((u) => u.email?.toLowerCase() === email);
  if (data.users.length < 200) break;
}

if (user) {
  const { error } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
  if (error) throw error;
  console.log(`Password set for ${email}. You can now sign in with it. Remove the two RAFIQ_ACCOUNT_* lines from .env.`);
} else {
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  console.log(`No account for ${email} existed, so one was created with that password. Remove the two RAFIQ_ACCOUNT_* lines from .env.`);
}
