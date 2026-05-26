= window.location.origin;

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}

function handleResponse(response) {
  if (!response.ok) {
    return response.json().then(err => {
      throw new Error(err.message || 'Request failed');
    });
  }
  return response.json();
}

function apiGet(endpoint) {
  return fetch(`${baseUrl}${endpoint}`, {
    method: 'GET',
    headers: getHeaders(),
  }).then(handleResponse);
}

function apiPost(endpoint, data) {
  return fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  }).then(handleResponse);
}

function apiPut(endpoint, data) {
  return fetch(`${baseUrl}${endpoint}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data),
  }).then(handleResponse);
}

function apiDelete(endpoint) {
  return fetch(`${baseUrl}${endpoint}`, {
    method: 'DELETE',
    headers: getHeaders(),
  }).then(handleResponse);
}

const inquiry = {
  getAll: () => apiGet('/api/inquiry'),
  create: (data) => apiPost('/api/inquiry', data),
  update: (id, data) => apiPut(`/api/inquiry/${id}`, data),
  remove: (id) => apiDelete(`/api/inquiry/${id}`),
};

const github = {
  sync: () => apiPost('/api/github/sync'),
};

module.exports = {
  inquiry,
  github,
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
};