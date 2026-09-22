// pm2 ecosystem — run the web dashboard as a 24/7 service.
//
// Usage (from this repo root, after ./setup.sh, .env filled, and a production
// build exists — npm run build):
//   pm2 start ecosystem.config.cjs
//   pm2 save && pm2 startup     // auto-start when the VPS reboots
//
// Daily commands:
//   pm2 status                  // thor-dash must be online
//   pm2 logs thor-dash
//   pm2 restart thor-dash
//
// v4.1.0: this repository is the WEB DASHBOARD ONLY. The Discord bot runs as
// its own pm2 app (thor-bot) from the SEPARATE Thor-EN repository — see that
// repo's ecosystem.config.cjs.
module.exports = {
  apps: [
    {
      name: "thor-dash",
      script: "npm",
      args: "run start",
      cwd: __dirname,
      time: true,
      max_memory_restart: "400M",
    },
  ],
};
