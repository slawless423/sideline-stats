/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pdfkit'],
  async headers() {
    return [
      {
        source: '/api/recruiting/njcaa-import',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, x-import-secret' },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
