from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0005_applicantdocument_ocr_error'),
    ]

    operations = [
        migrations.AddField(
            model_name='application',
            name='evaluation_error',
            field=models.TextField(blank=True, default=''),
        ),
    ]
