# Screen Share Application

A real-time screen sharing application built with Node.js and WebRTC.

## Prerequisites

- Node.js 18 or higher
- Docker
- Jenkins
- Git

## Local Development Setup

1. Clone the repository:
```bash
git clone <your-repository-url>
cd screen_show
```

2. Install dependencies:
```bash
npm install
```

3. Generate SSL certificates:
```bash
node generate-cert.js
```

4. Start the development server:
```bash
npm run dev
```

## Docker Setup

1. Build the Docker image:
```bash
docker build -t screen-show .
```

2. Run the container:
```bash
docker run -p 3000:3000 -p 3001:3001 screen-show
```

## CI/CD Pipeline Setup

### GitHub Repository Setup

1. Create a new repository on GitHub
2. Push your code:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-github-repo-url>
git push -u origin main
```

### Jenkins Setup

1. Install Jenkins on your server
2. Install required plugins:
   - Docker Pipeline
   - Git
   - NodeJS
   - Pipeline: GitHub

3. Configure Jenkins credentials:
   - Add Docker Hub credentials
   - Add GitHub credentials

4. Create a new Pipeline job in Jenkins:
   - Source: GitHub
   - Repository: <your-github-repo-url>
   - Branch: main
   - Script Path: Jenkinsfile

### Environment Variables

Create a `.env` file in the root directory:
```
NODE_ENV=development
PORT=3000
HTTPS_PORT=3001
```

## Project Structure

```
screen_show/
├── .github/           # GitHub Actions workflows
├── k8s/              # Kubernetes configurations
├── public/           # Static files
├── ssl/              # SSL certificates
├── test/             # Test files
├── .dockerignore     # Docker ignore file
├── .gitlab-ci.yml    # GitLab CI configuration
├── Dockerfile        # Docker configuration
├── Jenkinsfile       # Jenkins pipeline
├── config.js         # Application configuration
├── generate-cert.js  # SSL certificate generator
├── package.json      # Project dependencies
├── render.yaml       # Render deployment config
└── server.js         # Main application file
```

## Available Scripts

- `npm start`: Start the production server
- `npm run dev`: Start the development server
- `npm test`: Run tests
- `npm run build`: Build the application

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License. 