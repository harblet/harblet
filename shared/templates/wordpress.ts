import type { Template } from '../types/template'

export default {
  id: 'wordpress',
  name: 'WordPress',
  description: 'The most widely used system for websites and blogs.',
  icon: 'i-logos-wordpress-icon',
  website: 'https://wordpress.org',
  domain: 'wordpress',
  services: {
    database: {
      type: 'mysql',
      name: 'WordPress database',
      version: '8.4',
      databaseUser: 'wordpress',
      databaseName: 'wordpress'
    },
    wordpress: {
      type: 'image',
      name: 'WordPress',
      image: 'wordpress:latest',
      port: 80,
      variables: {
        WORDPRESS_DB_HOST: '${database.hostname}',
        WORDPRESS_DB_USER: '${database.user}',
        WORDPRESS_DB_PASSWORD: '${database.password}',
        WORDPRESS_DB_NAME: '${database.database}'
      },
      volumes: ['/var/www/html']
    }
  }
} satisfies Template
