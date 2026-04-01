// PM2 Ecosystem Config — starts both backend and frontend as persistent services
// Run:  pm2 start /home/AFRICA\ LOGISTICS/ecosystem.config.cjs
// Logs: pm2 logs
// Stop: pm2 stop all

module.exports = {
  apps: [
    {
      name: 'africa-backend',
      script: 'src/server.ts',
      interpreter: '/home/AFRICA LOGISTICS/africa-logistic-backend/node_modules/.bin/tsx',
      cwd: '/home/AFRICA LOGISTICS/africa-logistic-backend',
      watch: false,
      env: { NODE_ENV: 'development' },
    },
    {
      name: 'africa-frontend',
      script: '/home/AFRICA LOGISTICS/africa-logistic-frontend/node_modules/.bin/vite',
      cwd: '/home/AFRICA LOGISTICS/africa-logistic-frontend',
      watch: false,
      env: { NODE_ENV: 'development' },
    },
  ],
}
