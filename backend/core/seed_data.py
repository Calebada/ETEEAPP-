from django.core.management.base import BaseCommand
from core.models import Program, CurriculumSubject, User

def seed_bsit_program():
    program, created = Program.objects.get_or_create(
        code='BSIT',
        defaults={'name': 'Bachelor of Science in Information Technology'}
    )
    
    if created:
        print(f'Created program: {program}')
    
    subjects_data = [
        {'code': 'IT111', 'title': 'Introduction to Computing', 'description': 'Fundamentals of computing, hardware, software, and information systems', 'units': 3, 'year': 1, 'semester': 1, 'prereqs': []},
        {'code': 'IT112', 'title': 'Computer Programming 1', 'description': 'Introduction to programming logic and algorithms using a structured programming language', 'units': 3, 'year': 1, 'semester': 1, 'prereqs': []},
        {'code': 'GE-MATH1', 'title': 'Mathematics in the Modern World', 'description': 'Mathematical concepts and their applications in real-world scenarios', 'units': 3, 'year': 1, 'semester': 1, 'prereqs': []},
        {'code': 'GE-PURPCOM', 'title': 'Purposive Communication', 'description': 'Communication skills for academic and professional contexts', 'units': 3, 'year': 1, 'semester': 1, 'prereqs': []},
        {'code': 'NSTP1', 'title': 'National Service Training Program 1', 'description': 'Civic welfare training and national service', 'units': 3, 'year': 1, 'semester': 1, 'prereqs': []},
        {'code': 'PE1', 'title': 'Physical Education 1', 'description': 'Physical fitness and wellness activities', 'units': 2, 'year': 1, 'semester': 1, 'prereqs': []},
        
        {'code': 'IT121', 'title': 'Computer Programming 2', 'description': 'Object-oriented programming concepts and implementation', 'units': 3, 'year': 1, 'semester': 2, 'prereqs': ['IT112']},
        {'code': 'IT122', 'title': 'Discrete Mathematics', 'description': 'Mathematical structures for computer science including logic, sets, relations, and graphs', 'units': 3, 'year': 1, 'semester': 2, 'prereqs': ['GE-MATH1']},
        {'code': 'IT123', 'title': 'Web Development 1', 'description': 'HTML, CSS, JavaScript fundamentals for web development', 'units': 3, 'year': 1, 'semester': 2, 'prereqs': ['IT112']},
        {'code': 'GE-STS', 'title': 'Science, Technology and Society', 'description': 'Interrelationship of science, technology and society', 'units': 3, 'year': 1, 'semester': 2, 'prereqs': []},
        {'code': 'GE-ETHICS', 'title': 'Ethics', 'description': 'Moral philosophy and ethical decision-making', 'units': 3, 'year': 1, 'semester': 2, 'prereqs': []},
        {'code': 'NSTP2', 'title': 'National Service Training Program 2', 'description': 'Continuation of civic welfare training', 'units': 3, 'year': 1, 'semester': 2, 'prereqs': ['NSTP1']},
        {'code': 'PE2', 'title': 'Physical Education 2', 'description': 'Advanced physical fitness activities', 'units': 2, 'year': 1, 'semester': 2, 'prereqs': ['PE1']},
        
        {'code': 'IT211', 'title': 'Data Structures and Algorithms', 'description': 'Implementation and analysis of data structures and algorithms', 'units': 3, 'year': 2, 'semester': 1, 'prereqs': ['IT121', 'IT122']},
        {'code': 'IT212', 'title': 'Database Management Systems', 'description': 'Database design, implementation, and management using SQL', 'units': 3, 'year': 2, 'semester': 1, 'prereqs': ['IT121']},
        {'code': 'IT213', 'title': 'Web Development 2', 'description': 'Server-side web development and database integration', 'units': 3, 'year': 2, 'semester': 1, 'prereqs': ['IT123', 'IT212']},
        {'code': 'IT214', 'title': 'Information Management', 'description': 'Management of information resources in organizations', 'units': 3, 'year': 2, 'semester': 1, 'prereqs': ['IT111']},
        {'code': 'GE-RIZAL', 'title': 'Life and Works of Rizal', 'description': 'Study of Jose Rizal\'s life, works, and writings', 'units': 3, 'year': 2, 'semester': 1, 'prereqs': []},
        {'code': 'PE3', 'title': 'Physical Education 3', 'description': 'Sports and recreational activities', 'units': 2, 'year': 2, 'semester': 1, 'prereqs': ['PE2']},
        
        {'code': 'IT221', 'title': 'Object-Oriented Programming', 'description': 'Advanced OOP concepts, design patterns, and best practices', 'units': 3, 'year': 2, 'semester': 2, 'prereqs': ['IT121']},
        {'code': 'IT222', 'title': 'Networking 1', 'description': 'Computer networks, protocols, and network architecture', 'units': 3, 'year': 2, 'semester': 2, 'prereqs': ['IT111']},
        {'code': 'IT223', 'title': 'Human Computer Interaction', 'description': 'User interface design and usability principles', 'units': 3, 'year': 2, 'semester': 2, 'prereqs': ['IT123']},
        {'code': 'IT224', 'title': 'Software Engineering 1', 'description': 'Software development life cycle and methodologies', 'units': 3, 'year': 2, 'semester': 2, 'prereqs': ['IT211']},
        {'code': 'GE-READ-PH', 'title': 'Readings in Philippine History', 'description': 'Primary sources in Philippine history', 'units': 3, 'year': 2, 'semester': 2, 'prereqs': []},
        {'code': 'PE4', 'title': 'Physical Education 4', 'description': 'Physical fitness and wellness program', 'units': 2, 'year': 2, 'semester': 2, 'prereqs': ['PE3']},
        
        {'code': 'IT311', 'title': 'Systems Integration and Architecture', 'description': 'Enterprise system integration and architectural patterns', 'units': 3, 'year': 3, 'semester': 1, 'prereqs': ['IT212', 'IT222']},
        {'code': 'IT312', 'title': 'Information Assurance and Security', 'description': 'Cybersecurity principles, threats, and countermeasures', 'units': 3, 'year': 3, 'semester': 1, 'prereqs': ['IT222']},
        {'code': 'IT313', 'title': 'Software Engineering 2', 'description': 'Advanced software engineering, testing, and project management', 'units': 3, 'year': 3, 'semester': 1, 'prereqs': ['IT224']},
        {'code': 'IT-ELEC1', 'title': 'IT Elective 1 (Mobile Development)', 'description': 'Mobile application development for iOS and Android', 'units': 3, 'year': 3, 'semester': 1, 'prereqs': ['IT221']},
        {'code': 'GE-ART', 'title': 'Art Appreciation', 'description': 'Understanding and appreciation of various art forms', 'units': 3, 'year': 3, 'semester': 1, 'prereqs': []},
        
        {'code': 'IT321', 'title': 'Capstone Project 1', 'description': 'First phase of capstone project development', 'units': 3, 'year': 3, 'semester': 2, 'prereqs': ['IT313']},
        {'code': 'IT322', 'title': 'Advanced Database Systems', 'description': 'NoSQL databases, data warehousing, and big data', 'units': 3, 'year': 3, 'semester': 2, 'prereqs': ['IT212']},
        {'code': 'IT-ELEC2', 'title': 'IT Elective 2 (Cloud Computing)', 'description': 'Cloud platforms, services, and deployment models', 'units': 3, 'year': 3, 'semester': 2, 'prereqs': ['IT311']},
        {'code': 'IT-ELEC3', 'title': 'IT Elective 3 (Artificial Intelligence)', 'description': 'AI fundamentals, machine learning, and neural networks', 'units': 3, 'year': 3, 'semester': 2, 'prereqs': ['IT211']},
        {'code': 'GE-WORLD', 'title': 'The Contemporary World', 'description': 'Global issues and contemporary challenges', 'units': 3, 'year': 3, 'semester': 2, 'prereqs': []},
        
        {'code': 'IT411', 'title': 'Capstone Project 2', 'description': 'Final phase of capstone project and defense', 'units': 3, 'year': 4, 'semester': 1, 'prereqs': ['IT321']},
        {'code': 'IT412', 'title': 'IT Professional Practice', 'description': 'Professional ethics, legal issues, and career preparation', 'units': 3, 'year': 4, 'semester': 1, 'prereqs': []},
        {'code': 'IT-ELEC4', 'title': 'IT Elective 4 (DevOps)', 'description': 'DevOps practices, CI/CD, and automation', 'units': 3, 'year': 4, 'semester': 1, 'prereqs': ['IT313']},
        
        {'code': 'IT421', 'title': 'Practicum (600 hours)', 'description': 'On-the-job training in IT industry', 'units': 6, 'year': 4, 'semester': 2, 'prereqs': ['IT411']},
    ]
    
    for subject_data in subjects_data:
        subject, created = CurriculumSubject.objects.get_or_create(
            program=program,
            code=subject_data['code'],
            defaults={
                'title': subject_data['title'],
                'description': subject_data['description'],
                'units': subject_data['units'],
                'year': subject_data['year'],
                'semester': subject_data['semester'],
                'prerequisites': subject_data['prereqs'],
            }
        )
        if created:
            print(f'Created subject: {subject.code} - {subject.title}')
    
    print(f'\nTotal subjects in BSIT: {CurriculumSubject.objects.filter(program=program).count()}')

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
            print(f'Created user: {user.email} (role: {user.role}, password: {user_data["password"]})')

if __name__ == '__main__':
    print('Seeding BSIT program...')
    seed_bsit_program()
    print('\nCreating demo users...')
    create_demo_users()
    print('\nSeeding completed!')
