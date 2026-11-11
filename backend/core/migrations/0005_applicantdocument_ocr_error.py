from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0004_applicantdocument_file_sha256'),
    ]

    operations = [
        migrations.AddField(
            model_name='applicantdocument',
            name='ocr_error',
            field=models.TextField(blank=True, default=''),
        ),
    ]
