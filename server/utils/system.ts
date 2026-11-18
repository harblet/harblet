import { hkdfSync } from 'node:crypto'

export const registryHost = 'zot.harblet-system.svc.cluster.local:5000'

export const systemNamespace = 'harblet-system'
export const k3sVersion = 'v1.36.6+k3s1'
const nodeSelector = { 'node-role.kubernetes.io/control-plane': 'true' }

const zotConfig = {
  distSpecVersion: '1.1.1',
  storage: {
    rootDirectory: '/var/lib/registry',
    gc: true,
    gcInterval: '10m',
    retention: {
      policies: [{
        repositories: ['**'],
        deleteReferrers: true,
        deleteUntagged: true,
        keepTags: [{ mostRecentlyPushedCount: 5 }]
      }]
    }
  },
  http: {
    address: '0.0.0.0',
    port: '5000',
    auth: { htpasswd: { path: '/etc/zot/htpasswd' } },
    accessControl: {
      repositories: {
        '**': {
          policies: [
            { users: ['push'], actions: ['read', 'create', 'update', 'delete'] },
            { users: ['pull'], actions: ['read'] }
          ]
        }
      }
    }
  },
  log: { level: 'info' }
}

function labels(name: string) {
  return { 'app.kubernetes.io/name': name, 'app.kubernetes.io/managed-by': 'harblet' }
}

function volumeClaim(name: string, storage: string) {
  return {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: { name, namespace: systemNamespace, labels: labels(name) },
    spec: {
      accessModes: ['ReadWriteOnce'],
      storageClassName: 'local-path',
      resources: { requests: { storage } }
    }
  }
}

export function siteDomain() {
  const { protocol, hostname } = new URL(useRuntimeConfig().public.siteUrl)
  return protocol === 'https:' ? hostname : undefined
}

export async function applySiteDomain(hostname: string, certificate: { certificate: string, privateKey: string }) {
  await kubeApply({
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: { name: 'harblet-domain', namespace: systemNamespace, labels: labels('harblet') },
    type: 'kubernetes.io/tls',
    data: {
      'tls.crt': Buffer.from(certificate.certificate).toString('base64'),
      'tls.key': Buffer.from(certificate.privateKey).toString('base64')
    }
  })
  await kubeApply({
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name: 'harblet',
      namespace: systemNamespace,
      labels: labels('harblet'),
      annotations: { 'traefik.ingress.kubernetes.io/router.entrypoints': 'websecure' }
    },
    spec: {
      ingressClassName: 'traefik',
      tls: [{ hosts: [hostname], secretName: 'harblet-domain' }],
      rules: [{
        host: hostname,
        http: {
          paths: [{
            path: '/',
            pathType: 'Prefix',
            backend: { service: { name: 'harblet', port: { name: 'http' } } }
          }]
        }
      }]
    }
  })
}

export async function syncSiteDomain() {
  const hostname = siteDomain()
  if (!hostname) {
    return
  }
  const certificate = matchCertificate(await db.query.certificates.findMany(), hostname)
  if (certificate) {
    await applySiteDomain(hostname, certificate)
  }
}

export async function applySystemComponents() {
  const { appSecret } = useRuntimeConfig()
  const password = Buffer.from(hkdfSync('sha256', appSecret, 'nuxt', 'harblet:registry-push', 24)).toString('base64url')
  const dockerConfig = { auths: { [registryHost]: { auth: Buffer.from(`push:${password}`).toString('base64') } } }

  await kubeApply({
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: { name: 'registry-push', namespace: systemNamespace, labels: labels('zot') },
    type: 'Opaque',
    data: {
      'password': Buffer.from(password).toString('base64'),
      'config.json': Buffer.from(JSON.stringify(dockerConfig)).toString('base64')
    }
  })

  await kubeApply(volumeClaim('zot', '20Gi'))
  await kubeApply({
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'zot', namespace: systemNamespace, labels: labels('zot') },
    spec: {
      replicas: 1,
      strategy: { type: 'Recreate' },
      selector: { matchLabels: { 'app.kubernetes.io/name': 'zot' } },
      template: {
        metadata: { labels: labels('zot') },
        spec: {
          nodeSelector,
          automountServiceAccountToken: false,
          securityContext: { runAsNonRoot: true, runAsUser: 65532, runAsGroup: 65532 },
          initContainers: [{
            name: 'config',
            image: 'httpd:2.4.69-alpine',
            command: ['sh', '-c', 'printf %s "$CONFIG" > /etc/zot/config.json && htpasswd -Bbc /etc/zot/htpasswd pull "$PULL_PASSWORD" && htpasswd -Bb /etc/zot/htpasswd push "$PUSH_PASSWORD"'],
            env: [
              { name: 'CONFIG', value: JSON.stringify(zotConfig) },
              { name: 'PULL_PASSWORD', valueFrom: { secretKeyRef: { name: 'registry-pull', key: 'password' } } },
              { name: 'PUSH_PASSWORD', valueFrom: { secretKeyRef: { name: 'registry-push', key: 'password' } } }
            ],
            volumeMounts: [{ name: 'config', mountPath: '/etc/zot' }]
          }],
          containers: [{
            name: 'zot',
            image: 'ghcr.io/project-zot/zot-minimal:v2.1.23',
            ports: [{ name: 'registry', containerPort: 5000 }],
            readinessProbe: { httpGet: { path: '/readyz', port: 'registry' } },
            volumeMounts: [
              { name: 'config', mountPath: '/etc/zot' },
              { name: 'data', mountPath: '/var/lib/registry' }
            ]
          }],
          volumes: [
            { name: 'config', emptyDir: {} },
            { name: 'data', persistentVolumeClaim: { claimName: 'zot' } }
          ]
        }
      }
    }
  })
  await kubeApply({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'zot', namespace: systemNamespace, labels: labels('zot') },
    spec: {
      type: 'NodePort',
      selector: { 'app.kubernetes.io/name': 'zot' },
      ports: [{ name: 'registry', port: 5000, targetPort: 'registry', nodePort: 30500 }]
    }
  })

  await kubeApply(volumeClaim('buildkit', '50Gi'))
  await kubeApply({
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'buildkit', namespace: systemNamespace, labels: labels('buildkit') },
    spec: {
      replicas: 1,
      strategy: { type: 'Recreate' },
      selector: { matchLabels: { 'app.kubernetes.io/name': 'buildkit' } },
      template: {
        metadata: { labels: labels('buildkit') },
        spec: {
          nodeSelector,
          automountServiceAccountToken: false,
          containers: [{
            name: 'buildkit',
            image: 'moby/buildkit:v0.34.2-rootless',
            args: [
              '--addr', 'unix:///run/user/1000/buildkit/buildkitd.sock',
              '--addr', 'tcp://0.0.0.0:1234',
              '--oci-worker-no-process-sandbox'
            ],
            ports: [{ name: 'buildkit', containerPort: 1234 }],
            readinessProbe: { exec: { command: ['buildctl', 'debug', 'workers'] } },
            securityContext: {
              runAsUser: 1000,
              runAsGroup: 1000,
              seccompProfile: { type: 'Unconfined' },
              appArmorProfile: { type: 'Unconfined' }
            },
            volumeMounts: [{ name: 'cache', mountPath: '/home/user/.local/share/buildkit' }]
          }],
          volumes: [{ name: 'cache', persistentVolumeClaim: { claimName: 'buildkit' } }]
        }
      }
    }
  })
  await kubeApply({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'buildkit', namespace: systemNamespace, labels: labels('buildkit') },
    spec: {
      selector: { 'app.kubernetes.io/name': 'buildkit' },
      ports: [{ name: 'buildkit', port: 1234, targetPort: 'buildkit' }]
    }
  })
  await kubeApply({
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: { name: 'buildkit', namespace: systemNamespace, labels: labels('buildkit') },
    spec: {
      podSelector: { matchLabels: { 'app.kubernetes.io/name': 'buildkit' } },
      policyTypes: ['Ingress'],
      ingress: [{
        from: [{ podSelector: { matchLabels: { 'harblet.com/component': 'build' } } }],
        ports: [{ port: 1234 }]
      }]
    }
  })

  await kubeApply({
    apiVersion: 'v1',
    kind: 'ServiceAccount',
    metadata: { name: 'system-upgrade-controller', namespace: systemNamespace, labels: labels('system-upgrade-controller') }
  })
  await kubeApply({
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'ClusterRoleBinding',
    metadata: { name: 'system-upgrade-controller', labels: labels('system-upgrade-controller') },
    roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'ClusterRole', name: 'cluster-admin' },
    subjects: [{ kind: 'ServiceAccount', name: 'system-upgrade-controller', namespace: systemNamespace }]
  })
  await kubeApply({
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'system-upgrade-controller', namespace: systemNamespace, labels: labels('system-upgrade-controller') },
    spec: {
      replicas: 1,
      strategy: { type: 'Recreate' },
      selector: { matchLabels: { 'app.kubernetes.io/name': 'system-upgrade-controller' } },
      template: {
        metadata: { labels: labels('system-upgrade-controller') },
        spec: {
          nodeSelector,
          serviceAccountName: 'system-upgrade-controller',
          containers: [{
            name: 'system-upgrade-controller',
            image: 'rancher/system-upgrade-controller:v0.21.0',
            env: [
              { name: 'SYSTEM_UPGRADE_CONTROLLER_NAME', value: 'system-upgrade-controller' },
              { name: 'SYSTEM_UPGRADE_CONTROLLER_NAMESPACE', value: systemNamespace },
              { name: 'SYSTEM_UPGRADE_CONTROLLER_NODE_NAME', valueFrom: { fieldRef: { fieldPath: 'spec.nodeName' } } },
              { name: 'SYSTEM_UPGRADE_JOB_BACKOFF_LIMIT', value: '99' }
            ],
            securityContext: {
              runAsNonRoot: true,
              runAsUser: 65534,
              runAsGroup: 65534,
              allowPrivilegeEscalation: false,
              capabilities: { drop: ['ALL'] },
              seccompProfile: { type: 'RuntimeDefault' }
            }
          }]
        }
      }
    }
  })
}
