from django.contrib import admin
from django.urls import path, include

# ACCREDIA branding for the Django admin interface
admin.site.site_header = "ACCREDIA Administration"
admin.site.site_title = "ACCREDIA Admin"
admin.site.index_title = "ACCREDIA Credit Evaluation System"

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('core.urls')),
]
