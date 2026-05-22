import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const apiClient = axios.create({
  baseURL: API,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register') && window.location.pathname !== '/') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;

export const authApi = {
  register: (data) => apiClient.post('/auth/register/', data),
  login: (data) => apiClient.post('/auth/login/', data),
  googleAuth: (token) => apiClient.post('/auth/google/', { token }),
  me: () => apiClient.get('/auth/me/'),
};

export const applicationApi = {
  list: () => apiClient.get('/applications/'),
  create: (data) => apiClient.post('/applications/', data),
  get: (id) => apiClient.get(`/applications/${id}/`),
  update: (id, data) => apiClient.patch(`/applications/${id}/`, data),
  submit: (id) => apiClient.post(`/applications/${id}/submit/`),
  finalize: (id, data) => apiClient.post(`/applications/${id}/finalize/`, data),
  reject: (id, data) => apiClient.post(`/applications/${id}/reject/`, data),
  process: (id) => apiClient.post('/application/process/', { application_id: id }),
};

export const documentApi = {
  list: (applicationId) => apiClient.get(`/documents/?application_id=${applicationId}`),
  upload: (data) => apiClient.post('/upload/document/', data),
};

export const workExperienceApi = {
  list: (applicationId) => apiClient.get(`/work-experiences/?application_id=${applicationId}`),
  add: (data) => apiClient.post('/work-experience/add/', data),
  delete: (id) => apiClient.delete(`/work-experiences/${id}/`),
};

export const subjectMatchApi = {
  list: (applicationId) => apiClient.get(`/subject-matches/?application_id=${applicationId}`),
  flag: (id, note) => apiClient.post(`/subject-matches/${id}/flag/`, { note }),
  approve: (id, note) => apiClient.post(`/subject-matches/${id}/approve/`, { note }),
  reject: (id, note) => apiClient.post(`/subject-matches/${id}/reject/`, { note }),
  override: (id, data) => apiClient.post(`/subject-matches/${id}/override/`, data),
};

export const programApi = {
  list: () => apiClient.get('/programs/'),
  curriculum: (programId) => apiClient.get(`/curriculum-subjects/?program_id=${programId}`),
};

export const predictionApi = {
  get: (applicationId) => apiClient.get(`/predictions/?application_id=${applicationId}`),
};

export const chatApi = {
  sendMessage: (data) => apiClient.post('/chat/message/', data),
};

export const dashboardApi = {
  getStats: () => apiClient.get('/dashboard/stats/'),
};

export const courseApi = {
  recommend: (workExperiences) => apiClient.post('/recommend-course/', { work_experiences: workExperiences }),
};
