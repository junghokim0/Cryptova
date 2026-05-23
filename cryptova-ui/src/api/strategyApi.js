const API_BASE_URL = "http://127.0.0.1:8000";

function getAuthToken() {
  return localStorage.getItem("access_token");
}

export async function getStrategySettings() {
  const token = getAuthToken();

  if (!token) {
    throw new Error("Login is required.");
  }

  const response = await fetch(`${API_BASE_URL}/strategy/settings`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Failed to load strategy settings.");
  }

  return data;
}

export async function saveStrategySettings(settings) {
  const token = getAuthToken();

  if (!token) {
    throw new Error("Login is required.");
  }

  const response = await fetch(`${API_BASE_URL}/strategy/settings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(settings),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Failed to save strategy settings.");
  }

  return data;
}