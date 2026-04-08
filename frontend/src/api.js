const API_URL = 'http://localhost:5001/api'

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('token')
  const headers = { 'Content-Type': 'application/json', ...options.headers }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers })
  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error || 'Something went wrong')
  }

  return data
}

export const auth = {
  register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request('/auth/me'),
}

export const flights = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString()
    return request(`/flights${query ? '?' + query : ''}`)
  },
  getDeals: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/flights/deals${q ? '?' + q : ''}`)
  },
  getMeta: () => request('/flights/meta'),
  getById: (id) => request(`/flights/${id}`),
  getSeats: (flightId) => request(`/flights/${flightId}/seats`),
}

export const bookings = {
  create: (body) => request('/bookings', { method: 'POST', body: JSON.stringify(body) }),
  getAll: () => request('/bookings'),
  getById: (id) => request(`/bookings/${id}`),
  cancel: (id) => request(`/bookings/${id}/cancel`, { method: 'PATCH' }),
  confirmSeats: (bookingId, body) => request(`/bookings/${bookingId}/confirm-seats`, { method: 'POST', body: JSON.stringify(body) }),
}

export const seats = {
  lock: (seatIds) => request('/seats/lock', { method: 'POST', body: JSON.stringify({ seatIds }) }),
  swap: (body) => request('/seats/swap', { method: 'POST', body: JSON.stringify(body) }),
}

export const swapRequests = {
  create: (body) => request('/swap-request', { method: 'POST', body: JSON.stringify(body) }),
  list: () => request('/swap-requests'),
  accept: (id) => request(`/swap-request/${id}/accept`, { method: 'POST' }),
  decline: (id) => request(`/swap-request/${id}/decline`, { method: 'POST' }),
}

export const wallet = {
  get: () => request('/wallet'),
  addFunds: (amount) => request('/wallet/add-funds', { method: 'POST', body: JSON.stringify({ amount }) }),
}

export const payments = {
  khaltiInitiate: (body) => request('/payments/khalti/initiate', { method: 'POST', body: JSON.stringify(body) }),
  khaltiCallbackLookup: (queryString) => request(`/payments/khalti/callback?${queryString}`),
}
