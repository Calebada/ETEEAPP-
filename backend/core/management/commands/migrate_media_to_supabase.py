from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Upload selected local media files to the configured Supabase Storage bucket.'

    def add_arguments(self, parser):
        parser.add_argument('files', nargs='+', help='Paths relative to backend/media/')
        parser.add_argument('--overwrite', action='store_true')

    def handle(self, *args, **options):
        media_root = Path(settings.MEDIA_ROOT)
        uploaded = 0
        skipped = 0

        for relative_name in options['files']:
            source = (media_root / relative_name).resolve()
            if media_root.resolve() not in source.parents:
                raise CommandError(f'File is outside MEDIA_ROOT: {relative_name}')
            if not source.is_file():
                raise CommandError(f'File not found: {source}')

            storage_name = relative_name.replace('\\', '/')
            if default_storage.exists(storage_name) and not options['overwrite']:
                self.stdout.write(f'Skipped existing: {storage_name}')
                skipped += 1
                continue

            with source.open('rb') as file_obj:
                if options['overwrite'] and default_storage.exists(storage_name):
                    default_storage.delete(storage_name)
                default_storage.save(storage_name, File(file_obj, name=source.name))
            self.stdout.write(self.style.SUCCESS(f'Uploaded: {storage_name}'))
            uploaded += 1

        self.stdout.write(f'Uploaded {uploaded}; skipped {skipped}.')
