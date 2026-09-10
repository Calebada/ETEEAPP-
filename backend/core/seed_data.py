import os
import sys
from pathlib import Path

# Ensure Django environment is configured when running directly
if __name__ == '__main__':
    backend_dir = Path(__file__).resolve().parent.parent
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'accredia.settings')
    import django
    django.setup()

from core.models import Program, CurriculumSubject, User

def seed_bsit_program():
    program, created = Program.objects.get_or_create(
        code='BSIT',
        defaults={'name': 'Bachelor of Science in Information Technology'}
    )
    
    if created:
        print(f'Created program: {program}')
    else:
        print(f'Found program: {program}')
    
    subjects_data = [
        # Year 1, Semester 1
        {'code': 'CSIT111', 'title': 'Introduction to Computing', 'description': 'Fundamentals of computing, hardware, software, and information systems', 'units': 3, 'year': 1, 'semester': 1, 'prereqs': []},
        {'code': 'CSIT121', 'title': 'Fundamentals of Programming', 'description': 'Introduction to programming logic and algorithms using a structured programming language', 'units': 3, 'year': 1, 'semester': 1, 'prereqs': []},
        {'code': 'MATH031', 'title': 'Mathematics in the Modern World', 'description': 'Mathematical concepts and their applications in real-world scenarios', 'units': 3, 'year': 1, 'semester': 1, 'prereqs': []},
        {'code': 'NSTP111', 'title': 'National Service Training Program 1', 'description': 'Civic welfare training and national service', 'units': 3, 'year': 1, 'semester': 1, 'prereqs': []},
        {'code': 'PE103', 'title': 'Movement Enhancement / PATHFit 1-Movement Competency Training', 'description': 'Physical fitness and wellness activities', 'units': 2, 'year': 1, 'semester': 1, 'prereqs': []},
        {'code': 'PHILO031', 'title': 'Ethics', 'description': 'Moral philosophy and ethical decision-making', 'units': 3, 'year': 1, 'semester': 1, 'prereqs': []},
        {'code': 'ENGL031', 'title': 'Purposive Communication', 'description': 'Communication skills for academic and professional contexts', 'units': 3, 'year': 1, 'semester': 1, 'prereqs': []},
        {'code': 'PSYCH031', 'title': 'Understanding the Self', 'description': 'Nature of identity and the self, examining self-development and self-management for personal effectiveness', 'units': 3, 'year': 1, 'semester': 1, 'prereqs': []},

        # Year 1, Semester 2
        {'code': 'CS132', 'title': 'Introduction to Computer Systems', 'description': 'Fundamentals of computer organization and architecture, including data representation, digital logic, and the hardware-software interface', 'units': 3, 'year': 1, 'semester': 2, 'prereqs': []},
        {'code': 'CSIT112', 'title': 'Discrete Structures 1', 'description': 'Fundamental mathematical concepts for computer science, including logic, set theory, relations, functions, and combinatorics', 'units': 3, 'year': 1, 'semester': 2, 'prereqs': []},
        {'code': 'CSIT122', 'title': 'Intermediate Programming', 'description': 'Object-oriented programming concepts including classes, inheritance, polymorphism, and data structures using a high-level programming language', 'units': 3, 'year': 1, 'semester': 2, 'prereqs': []},
        {'code': 'CSIT201', 'title': 'Platform-based Development 2 (Web)', 'description': 'Web application development using client-side and server-side technologies, covering HTML, CSS, JavaScript, and server-side scripting', 'units': 1, 'year': 1, 'semester': 2, 'prereqs': []},
        {'code': 'HUM031', 'title': 'Art Appreciation', 'description': 'Nature, elements, and functions of art across various forms and media, developing critical and aesthetic appreciation', 'units': 3, 'year': 1, 'semester': 2, 'prereqs': []},
        {'code': 'NSTP112', 'title': 'National Service Training Program 2', 'description': 'Continuation of civic welfare, literacy, or military training component aimed at promoting civic consciousness and defense preparedness', 'units': 3, 'year': 1, 'semester': 2, 'prereqs': []},
        {'code': 'PE104', 'title': 'PATHFit 2 - Exercise-based Fitness Activities', 'description': 'Physical fitness through exercise-based activities, focusing on individual fitness assessment and training program design', 'units': 2, 'year': 1, 'semester': 2, 'prereqs': ['PE103']},
        {'code': 'SOCSCI031', 'title': 'Readings in Philippine History', 'description': 'Philippine history through the lens of primary sources, encouraging critical analysis of historical events and their interpretations', 'units': 3, 'year': 1, 'semester': 2, 'prereqs': []},
        {'code': 'STS031', 'title': 'Science, Technology and Society', 'description': 'Interaction between science, technology, and society, examining their impact on human life and the environment', 'units': 3, 'year': 1, 'semester': 2, 'prereqs': []},   

        # Year 2, Semester 1
        {'code': 'CSIT213', 'title': 'Social Issues and Professional Practice', 'description': 'Social and ethical issues in computing, professional responsibility, and standards of conduct in the IT profession', 'units': 3, 'year': 2, 'semester': 1, 'prereqs': ['CSIT111']},
        {'code': 'CSIT221', 'title': 'Data Structures and Algorithms', 'description': 'Fundamental data structures and algorithms, including their design, implementation, and analysis of efficiency', 'units': 3, 'year': 2, 'semester': 1, 'prereqs': ['CSIT122']},
        {'code': 'CSIT227', 'title': 'Object-oriented Programming 1', 'description': 'Object-oriented design and programming principles, including encapsulation, inheritance, and polymorphism', 'units': 3, 'year': 2, 'semester': 1, 'prereqs': ['CSIT122']},
        {'code': 'IT227', 'title': 'Networking 1', 'description': 'Fundamentals of data communications and computer networking, including network models, protocols, and topologies', 'units': 3, 'year': 2, 'semester': 1, 'prereqs': ['CS132']},
        {'code': 'PE205', 'title': 'PATHFit 3 - Menu of Sports, Dance, Recreation and Martial Arts, Group Exercise, Outdoor and Adventure Activities', 'description': 'Physical fitness through sports, dance, martial arts, and outdoor recreational activities', 'units': 2, 'year': 2, 'semester': 1, 'prereqs': ['PE103']},
        {'code': 'SOCSCI032', 'title': 'The Contemporary World', 'description': 'Contemporary global issues and processes, examining globalization and its effects on societies and cultures', 'units': 3, 'year': 2, 'semester': 1, 'prereqs': []},
        {'code': 'CSIT104', 'title': 'Platform-based Development 1 (Multimedia)', 'description': 'Multimedia application development, covering principles of digital media design and production tools', 'units': 1, 'year': 2, 'semester': 1, 'prereqs': []},
        {'code': 'GE-CCS1', 'title': 'General Education Elective 1', 'description': 'SDG031 (Sustainable Development Goals)', 'units': 3, 'year': 2, 'semester': 1, 'prereqs': []},

        # Year 2, Semester 2
        {'code': 'CSIT212', 'title': 'Quantitative Methods', 'description': 'Quantitative and statistical methods for analyzing and interpreting data relevant to IT decision-making', 'units': 3, 'year': 2, 'semester': 2, 'prereqs': ['CSIT112']},
        {'code': 'CSIT226', 'title': 'Information Management 1', 'description': 'Fundamentals of database design and management, including data modeling, normalization, and SQL', 'units': 3, 'year': 2, 'semester': 2, 'prereqs': ['CSIT221']},
        {'code': 'CSIT228', 'title': 'Object-oriented Programming 2', 'description': 'Advanced object-oriented programming concepts, including design patterns and application development', 'units': 3, 'year': 2, 'semester': 2, 'prereqs': ['CSIT227']},
        {'code': 'CSIT238', 'title': 'Human Computer Interaction', 'description': 'Principles of designing usable and user-centered interfaces, covering usability evaluation and interaction design', 'units': 3, 'year': 2, 'semester': 2, 'prereqs': []},
        {'code': 'CSIT284', 'title': 'Platform-based Development 3 (Mobile)', 'description': 'Mobile application development covering design principles, native/cross-platform tools, and deployment', 'units': 1, 'year': 2, 'semester': 2, 'prereqs': ['CSIT227']},
        {'code': 'GE-CCS2', 'title': 'General Education Elective 2', 'description': 'ES036B (Environmental Science)', 'units': 3, 'year': 2, 'semester': 2, 'prereqs': []},
        {'code': 'IT228', 'title': 'Networking 2', 'description': 'Advanced networking concepts, including routing, switching, and network security fundamentals', 'units': 3, 'year': 2, 'semester': 2, 'prereqs': ['IT227']},
        {'code': 'PE206', 'title': 'PATHFit 4 - Menu of Sports, Dance, Recreation and Martial Arts, Group Exercise, Outdoor and Adventure Activities', 'description': 'Physical fitness through sports, dance, martial arts, and outdoor recreational activities', 'units': 2, 'year': 2, 'semester': 2, 'prereqs': ['PE205']},

        # Year 3, Semester 1
        {'code': 'CSIT321', 'title': 'Applications Development and Emerging Technologies', 'description': 'Application development integrating emerging technologies and current industry trends and tools', 'units': 3, 'year': 3, 'semester': 1, 'prereqs': ['CSIT226', 'CSIT228', 'CSIT238']},
        {'code': 'CSIT327', 'title': 'Information Management 2', 'description': 'Advanced database concepts including distributed databases, transaction management, and database administration', 'units': 3, 'year': 3, 'semester': 1, 'prereqs': ['CSIT226']},
        {'code': 'CSITELEC1', 'title': 'CSIT Elective 1', 'description': 'CSIT340 (Industry Elective 1), or IT465 (Data Analytics 2)', 'units': 3, 'year': 3, 'semester': 1, 'prereqs': ['CSIT226', 'CSIT228']},
        {'code': 'ES038', 'title': 'Technopreneurship', 'description': 'Principles of entrepreneurship applied to technology-based business ventures and startups', 'units': 3, 'year': 3, 'semester': 1, 'prereqs': []},
        {'code': 'IT317', 'title': 'Project Management for IT', 'description': 'Project management principles and practices applied to planning and delivering IT projects', 'units': 3, 'year': 3, 'semester': 1, 'prereqs': ['CSIT213', 'CSIT226']},
        {'code': 'IT365', 'title': 'Data Analytics 1', 'description': 'Fundamentals of data analytics, including data collection, processing, and visualization techniques', 'units': 3, 'year': 3, 'semester': 1, 'prereqs': ['CSIT212', 'CSIT226']},
        {'code': 'RIZAL031', 'title': 'The Life and Works of Rizal', 'description': 'Life, works, and writings of Jose Rizal, examining his role in Philippine nationalism and history', 'units': 3, 'year': 3, 'semester': 1, 'prereqs': []},

        # Year 3, Semester 2
        {'code': 'CSIT385', 'title': 'Information Assurance and Security 1', 'description': 'Fundamentals of information security, including risk management, security policies, and protection mechanisms', 'units': 3, 'year': 3, 'semester': 2, 'prereqs': ['IT228']},
        {'code': 'CSITELEC2', 'title': 'CSIT Elective 2', 'description': 'CSIT349 (Applied AI), IT463 (Advanced Multimedia Systems), CSIT343 (Industry Elective 4), or CSIT440 (Industry Trends)', 'units': 3, 'year': 3, 'semester': 2, 'prereqs': ['CSIT321']},
        {'code': 'IT332', 'title': 'Capstone and Research 1', 'description': 'Initial phase of the capstone project, covering research proposal development and project planning', 'units': 3, 'year': 3, 'semester': 2, 'prereqs': ['CSIT321', 'IT317', 'IT365']},
        {'code': 'IT334', 'title': 'IS Strategy', 'description': 'Strategic planning and management of information systems within organizations', 'units': 3, 'year': 3, 'semester': 2, 'prereqs': ['CSIT327']},
        {'code': 'IT342', 'title': 'Systems Integration and Architecture 1', 'description': 'Principles of integrating hardware and software components into cohesive system architectures', 'units': 3, 'year': 3, 'semester': 2, 'prereqs': ['CSIT321']},
        {'code': 'IT344', 'title': 'Systems Administration and Maintenance', 'description': 'System administration tasks including installation, configuration, and maintenance of computer systems', 'units': 3, 'year': 3, 'semester': 2, 'prereqs': ['IT228']},
        {'code': 'ITFREEEL1', 'title': 'Free Elective 1', 'description': 'CSIT335 (Testing and Quality Assurance)', 'units': 3, 'year': 3, 'semester': 2, 'prereqs': ['CSIT226']},

        # Year 4, Semester 1
        {'code': 'CSITELEC3', 'title': 'CSIT Elective 3', 'description': 'IT461 (Advanced Web Systems), or CSIT341 (Industry Elective 2)', 'units': 3, 'year': 4, 'semester': 1, 'prereqs': ['CSIT321']},
        {'code': 'CSITELEC4', 'title': 'CSIT Elective 4', 'description': 'IT462 (Advanced Mobile Technologies), or CSIT342 (Industry Elective 3), or CSIT360 (Introduction to Blockchain)', 'units': 3, 'year': 4, 'semester': 1, 'prereqs': ['CSIT321']},
        {'code': 'GE-CCS3', 'title': 'General Education Elective 3', 'description': 'ENGL014 (Technical Writing)', 'units': 3, 'year': 4, 'semester': 1, 'prereqs': []},
        {'code': 'IT386', 'title': 'Information Assurance and Security 2', 'description': 'Advanced information security topics, including security architecture, auditing, and incident response', 'units': 3, 'year': 4, 'semester': 1, 'prereqs': ['CSIT385']},
        {'code': 'IT411', 'title': 'Capstone and Research 2', 'description': 'Continuation of the capstone project, covering system implementation, testing, and final defense', 'units': 3, 'year': 4, 'semester': 1, 'prereqs': ['IT332']},
        {'code': 'IT-FREEEL2', 'title': 'Free Elective 2', 'description': 'FL033 (Foreign Language 3 (Nihongo 1))', 'units': 3, 'year': 4, 'semester': 1, 'prereqs': []},       

        # Year 4, Semester 2
        {'code': 'IT412', 'title': 'OJT/Practicum', 'description': 'Supervised on-the-job training in an industry setting, applying IT knowledge and skills in a professional environment', 'units': 12, 'year': 4, 'semester': 2, 'prereqs': []},
    ]
    
    valid_codes = set()
    created_count = 0
    updated_count = 0
    
    for subject_data in subjects_data:
        code = subject_data['code']
        valid_codes.add(code)
        
        # Check for existing subjects with this code
        existing_qs = CurriculumSubject.objects.filter(program=program, code=code)
        existing_count = existing_qs.count()
        
        if existing_count > 1:
            # Keep the primary one, delete duplicates
            primary = existing_qs.first()
            existing_qs.exclude(id=primary.id).delete()
            subject = primary
            created = False
        elif existing_count == 1:
            subject = existing_qs.first()
            created = False
        else:
            subject = CurriculumSubject(program=program, code=code)
            created = True
        
        subject.title = subject_data['title']
        subject.description = subject_data['description']
        subject.units = subject_data['units']
        subject.year = subject_data['year']
        subject.semester = subject_data['semester']
        subject.prerequisites = subject_data['prereqs']
        subject.save()
        
        if created:
            created_count += 1
            print(f'Created subject: {subject.code} - {subject.title}', flush=True)
        else:
            updated_count += 1

    # Remove obsolete/garbage subjects that are no longer in the curriculum
    deleted_count, _ = CurriculumSubject.objects.filter(program=program).exclude(code__in=valid_codes).delete()
    if deleted_count > 0:
        print(f'Removed {deleted_count} obsolete/duplicate subjects from {program.code} curriculum.', flush=True)
    
    total_active = CurriculumSubject.objects.filter(program=program).count()
    print(f'\nBSIT Curriculum Sync Summary: {created_count} created, {updated_count} updated, {deleted_count} obsolete/garbage removed.', flush=True)
    print(f'Total active subjects in BSIT: {total_active}', flush=True)

def create_demo_users():
    users_data = [
        {
            'email': 'evaluator@citu.edu',
            'full_name': 'Maria Santos',
            'role': 'evaluator',
            'password': 'evaluator123'
        },
        {
            'email': 'admin@citu.edu',
            'full_name': 'Juan Dela Cruz',
            'role': 'admin',
            'password': 'admin123'
        },
        {
            'email': 'applicant@test.com',
            'full_name': 'Pedro Reyes',
            'role': 'applicant',
            'password': 'applicant123'
        },
    ]
    
    for user_data in users_data:
        user, created = User.objects.get_or_create(
            email=user_data['email'],
            defaults={
                'full_name': user_data['full_name'],
                'role': user_data['role'],
            }
        )
        if created:
            user.set_password(user_data['password'])
            if user_data['role'] == 'admin':
                user.is_staff = True
                user.is_superuser = True
            user.save()
            print(f'Created user: {user.email} (role: {user.role}, password: {user_data["password"]})', flush=True)

if __name__ == '__main__':
    print('Seeding & Synchronizing BSIT program...', flush=True)
    seed_bsit_program()
    print('\nCreating demo users...', flush=True)
    create_demo_users()
    print('\nSeeding completed!', flush=True)
