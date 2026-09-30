// Sign-in settings: email code (and link), valid 10 minutes, and the app's address.
//
//   npm run auth:config                        local development (http://localhost:5173)
//   npm run auth:config -- https://rafiq.app   production address (localhost kept for development)
//
// The free plan only allows custom email templates with your own SMTP sender.
// With SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (and optionally SMTP_SENDER_NAME,
// SMTP_ADMIN_EMAIL) in .env, emails also carry a 6-digit code, so signing in on
// the phone never means leaving the app. Without them, Supabase's default email
// sends a sign-in link, which the app also handles.
const env = process.env;
const siteUrl = process.argv[2] ?? "http://localhost:5173";
const allow = [...new Set([`${siteUrl}/**`, "http://localhost:5173/**"])].join(",");

const settings = {
  site_url: siteUrl,
  uri_allow_list: allow,
  mailer_otp_length: 6,
  mailer_otp_exp: 600,
};

const smtp = env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS;
if (smtp) {
  const template = (intro) => `<h2>Your Rafiq code</h2>
<p>${intro}</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:8px;font-family:monospace">{{ .Token }}</p>
<p>Or open this link on your phone: <a href="{{ .ConfirmationURL }}">sign in to Rafiq</a></p>
<p>It works for 10 minutes. If you didn't ask for it, you can ignore this email.</p>`;
  Object.assign(settings, {
    smtp_host: env.SMTP_HOST,
    smtp_port: env.SMTP_PORT,
    smtp_user: env.SMTP_USER,
    smtp_pass: env.SMTP_PASS,
    smtp_admin_email: env.SMTP_ADMIN_EMAIL || env.SMTP_USER,
    smtp_sender_name: env.SMTP_SENDER_NAME || "Rafiq",
    rate_limit_email_sent: 30,
    mailer_subjects_magic_link: "Your Rafiq sign-in code",
    mailer_templates_magic_link_content: template("Enter this code in Rafiq to sign in:"),
    mailer_subjects_confirmation: "Your Rafiq sign-in code",
    mailer_templates_confirmation_content: template("Welcome to Rafiq. Enter this code to finish signing in:"),
  });
}

const res = await fetch(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/config/auth`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "content-type": "application/json" },
  body: JSON.stringify(settings),
});
if (!res.ok) {
  console.error(`Updating auth settings failed: ${res.status} ${await res.text()}`);
  process.exitCode = 1;
} else {
  console.log(`Auth: site ${siteUrl}; ${smtp ? "own SMTP sender, emails carry a 6-digit code" : "Supabase default email (sign-in link only; add SMTP_* to .env for codes)"}`);
}
