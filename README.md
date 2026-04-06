# DALLYLETTER-ELIDEMS-Smart-CAPS-LMS

## Project Overview
DALLYLETTER-ELIDEMS-Smart-CAPS-LMS is a Learning Management System designed to facilitate the management of courses, students, and educators. The platform aims to streamline the education process by providing an interactive and easy-to-use interface.

## Features
- **User Management**: Allows educators to manage student accounts and permissions.
- **Course Management**: Educators can create, update, and delete courses.
- **Interactive Lessons**: Provides features for interactive learning through quizzes and multimedia.
- **Progress Tracking**: Monitors student progress and performance through analytics.

## Tech Stack
- **Frontend**: React.js
- **Backend**: Node.js with Express
- **Database**: MongoDB
- **Authentication**: JSON Web Tokens (JWT)

## Installation Instructions
1. Clone the repository:  
   `git clone https://github.com/elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS.git`
2. Navigate to the project directory:  
   `cd DALLYLETTER-ELIDEMS-Smart-CAPS-LMS`
3. Install the dependencies:  
   `npm install`
4. Set up environment variables by creating a `.env` file in the root directory:
   ```
   PORT=4000
   MONGODB_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret
   ```
5. Start the application:  
   `npm start`

## Demo Accounts
- **Admin Account**:  
   - Username: admin@example.com  
   - Password: admin123
- **Student Account**:  
   - Username: student@example.com  
   - Password: student123

## How to Run Locally
1. Ensure you have Node.js and MongoDB installed on your machine.
2. Follow the installation instructions above.
3. After starting the application, navigate to `http://localhost:4000` in your web browser to access the application.