const path = require('path');
const fs = require('fs');

// Ensure logs directory exists before PM2 starts
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

module.exports = {
  apps: [
    {
      name: 'web-terminal',
      script: '.next/standalone/server.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3000,
        HOSTNAME: '0.0.0.0',
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      watch: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: path.join(logsDir, 'error.log'),
      out_file: path.join(logsDir, 'out.log'),
      merge_logs: true,
      time: true,
    },
  ],
};
