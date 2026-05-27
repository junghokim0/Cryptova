const API_BASE_URL = "http://127.0.0.1:8000";

function getToken() {
  return localStorage.getItem("access_token");
}

async function request(url) {
  const token = getToken();

  const response = await fetch(`${API_BASE_URL}${url}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Market API 요청 실패: ${response.status}`);
  }

  return response.json();
}

export async function getCandles({
  symbol = "BTCUSDT",
  interval = "60",
  limit = 200,
  category = "linear",
} = {}) {
  return request(
    `/market/candles?symbol=${symbol}&interval=${interval}&limit=${limit}&category=${category}`
  );
}