import http from 'k6/http';
import { check, sleep } from 'k6';
export const options = {
  vus: 10,
  duration: '20s',
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<750'] },
};
export default function () {
  const response = http.get(`${__ENV.BASE_URL || 'http://127.0.0.1:3000'}/api/health`);
  check(response, { 'health is 200': (r) => r.status === 200 });
  sleep(1);
}
