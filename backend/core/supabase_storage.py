from io import BytesIO
import os
from urllib.parse import quote

import requests
from django.core.files.base import ContentFile, File
from django.core.files.storage import Storage
from django.core.files.storage.base import get_random_string


class SupabaseStorage(Storage):
    """Django storage adapter for a private Supabase Storage bucket."""

    def __init__(self):
        self.base_url = os.getenv('SUPABASE_URL', '').rstrip('/')
        self.bucket = os.getenv('SUPABASE_STORAGE_BUCKET', 'applicant-documents')
        self.service_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')
        if not self.base_url or not self.service_key:
            raise RuntimeError(
                'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Supabase Storage.'
            )

    def _headers(self):
        return {
            'Authorization': f'Bearer {self.service_key}',
            'apikey': self.service_key,
        }

    def _object_url(self, name):
        encoded_name = quote(name.lstrip('/'), safe='/')
        return f'{self.base_url}/storage/v1/object/{quote(self.bucket, safe="")}/{encoded_name}'

    def _open(self, name, mode='rb'):
        if mode not in ('rb', 'r'):
            raise ValueError('SupabaseStorage supports read-only access.')
        response = requests.get(self._object_url(name), headers=self._headers(), timeout=60)
        response.raise_for_status()
        return File(BytesIO(response.content), name=name)

    def _save(self, name, content):
        if not name:
            name = get_random_string(20)
        payload = b''.join(content.chunks()) if hasattr(content, 'chunks') else content.read()
        headers = {
            **self._headers(),
            'Content-Type': getattr(content, 'content_type', None) or 'application/octet-stream',
            'x-upsert': 'false',
        }
        response = requests.post(
            self._object_url(name),
            headers=headers,
            data=payload,
            timeout=120,
        )
        response.raise_for_status()
        return name

    def delete(self, name):
        response = requests.delete(self._object_url(name), headers=self._headers(), timeout=60)
        if response.status_code not in (200, 204, 404):
            response.raise_for_status()

    def exists(self, name):
        headers = {**self._headers(), 'Range': 'bytes=0-0'}
        response = requests.get(self._object_url(name), headers=headers, timeout=30)
        if response.status_code == 404:
            return False
        if response.status_code == 400:
            try:
                if response.json().get('statusCode') == '404':
                    return False
            except ValueError:
                pass
        response.raise_for_status()
        return True

    def size(self, name):
        response = requests.head(self._object_url(name), headers=self._headers(), timeout=30)
        response.raise_for_status()
        return int(response.headers.get('Content-Length', 0))

    def url(self, name):
        return self._object_url(name)
