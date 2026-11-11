from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0003_torsubject_school_year_torsubject_semester_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='applicantdocument',
            name='file_sha256',
            field=models.CharField(blank=True, default='', max_length=64),
        ),
    ]
