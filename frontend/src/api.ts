// =============================================================================
// API Client — Simple fetch wrappers for backend calls
// =============================================================================

const API_BASE = '/api'

// -----------------------------------------------------------------------------
// Types (mirror backend schemas)
// -----------------------------------------------------------------------------

export interface CreateUserRequest {
  email: string
  firstName: string
  lastName: string
}

export interface CreateUserResponse {
  nickname: string
  email: string
  firstName: string
  lastName: string
}

export interface CreateAddressRequest {
  label: string
  streetNumber: string
  streetName: string
  zipCode: string
  city: string
  country: string
}

export interface CreateAddressResponse {
  label: string
  streetNumber: string
  streetName: string
  zipCode: string
  city: string
  country: string
}

export interface UpdateAddressFieldRequest {
  field: 'label' | 'streetNumber' | 'streetName' | 'zipCode' | 'city' | 'country'
  value: string
}

export interface UpdateAddressFieldResponse {
  field: string
  oldValue: string
  newValue: string
}

export interface RevertChangeResponse {
  reverted: boolean
  message: string
}

export interface GetUserResponse {
  user: {
    email: string
    firstName: string
    lastName: string
  }
  addresses: Array<{
    label: string
    streetNumber: string
    streetName: string
    zipCode: string
    city: string
    country: string
  }>
}

export interface ApiError {
  _tag: string
  message: string
}

// -----------------------------------------------------------------------------
// API Functions
// -----------------------------------------------------------------------------

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json() as ApiError
    throw error
  }
  return response.json() as Promise<T>
}

export async function createUser(data: CreateUserRequest): Promise<CreateUserResponse> {
  const response = await fetch(`${API_BASE}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  return handleResponse<CreateUserResponse>(response)
}

export async function createAddress(
  nickname: string,
  data: CreateAddressRequest
): Promise<CreateAddressResponse> {
  const response = await fetch(`${API_BASE}/users/${nickname}/addresses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  return handleResponse<CreateAddressResponse>(response)
}

export async function updateAddressField(
  nickname: string,
  label: string,
  data: UpdateAddressFieldRequest
): Promise<UpdateAddressFieldResponse> {
  const response = await fetch(`${API_BASE}/users/${nickname}/addresses/${label}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  return handleResponse<UpdateAddressFieldResponse>(response)
}

export async function revertChange(token: string): Promise<RevertChangeResponse> {
  const response = await fetch(`${API_BASE}/revert/${token}`, {
    method: 'POST'
  })
  return handleResponse<RevertChangeResponse>(response)
}

export async function getUser(nickname: string): Promise<GetUserResponse> {
  const response = await fetch(`${API_BASE}/users/${nickname}`, {
    method: 'GET'
  })
  return handleResponse<GetUserResponse>(response)
}
