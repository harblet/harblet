import type { Template } from '../types/template'

export default {
  id: 'gitlab',
  name: 'GitLab',
  description: 'Git hosting with merge requests, issues and CI/CD. Needs about 4 GB of free memory.',
  icon: 'i-logos-gitlab-icon',
  website: 'https://about.gitlab.com',
  note: 'The first start takes several minutes. Log in as root with the password in the service\'s GITLAB_ROOT_PASSWORD variable. Git works over HTTPS, not SSH.',
  domain: 'gitlab',
  services: {
    gitlab: {
      type: 'image',
      name: 'GitLab',
      image: 'gitlab/gitlab-ce:19.5.5-ce.0',
      port: 80,
      healthCheckPath: '/users/sign_in',
      startTimeout: 20,
      variables: {
        GITLAB_OMNIBUS_CONFIG: 'external_url \'https://${domain}\'; nginx[\'listen_port\'] = 80; nginx[\'listen_https\'] = false; letsencrypt[\'enable\'] = false',
        GITLAB_ROOT_PASSWORD: '${secret}'
      },
      volumes: ['/etc/gitlab', '/var/log/gitlab', '/var/opt/gitlab']
    }
  }
} satisfies Template
