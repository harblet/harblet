#!/bin/sh
set -eu

k3s_version='v1.36.6+k3s1'
version='0.1.0' # x-release-please-version
image="${HARBLET_IMAGE:-ghcr.io/harblet/harblet:$version}"
url="${HARBLET_URL:-}"
app_secret="${HARBLET_APP_SECRET:-}"
backup="${HARBLET_BACKUP:-}"

if [ -z "$url" ]; then
  address=$(ip -4 -o route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p')
  if [ -z "$address" ]; then
    echo "This server's IPv4 address couldn't be found. Set HARBLET_URL to the address Harblet is reached at, for example HARBLET_URL=http://203.0.113.10:3000." >&2
    exit 1
  fi
  url="http://$address:3000"
fi

if command -v k3s >/dev/null 2>&1; then
  echo "k3s is already installed on this server, so Harblet can't be installed." >&2
  exit 1
fi

if [ -n "$backup" ]; then
  if [ "$(head -c 5 "$backup" 2>/dev/null)" != PGDMP ]; then
    echo "$backup isn't a backup of Harblet's database. Set HARBLET_BACKUP to the .dump file from the backup destination." >&2
    exit 1
  fi
  if [ -z "$app_secret" ]; then
    echo "Restoring a backup needs the app secret of the install it comes from. Set HARBLET_APP_SECRET to it." >&2
    exit 1
  fi
fi

if [ -n "$app_secret" ] && ! printf %s "$app_secret" | grep -Eqx '[0-9a-f]{64}'; then
  echo "HARBLET_APP_SECRET isn't an app secret. An app secret has 64 characters, the digits 0 to 9 and the letters a to f." >&2
  exit 1
fi

mkdir -p /etc/rancher/k3s /var/lib/rancher/k3s/server/manifests
cat > /etc/rancher/k3s/config.yaml <<'EOF'
cluster-init: true
flannel-backend: wireguard-native
secrets-encryption: true
kube-proxy-arg: nodeport-addresses=127.0.0.0/8
node-label:
- svccontroller.k3s.cattle.io/enablelb=true
EOF

cat > /etc/sysctl.d/90-harblet.conf <<'EOF'
kernel.apparmor_restrict_unprivileged_unconfined = 0
EOF
sysctl -e -q -p /etc/sysctl.d/90-harblet.conf

pull_password=$(openssl rand -hex 32)
cat > /etc/rancher/k3s/registries.yaml <<EOF
mirrors:
  "zot.harblet-system.svc.cluster.local:5000":
    endpoint:
      - http://127.0.0.1:30500
configs:
  "127.0.0.1:30500":
    auth:
      username: pull
      password: $pull_password
EOF
chmod 600 /etc/rancher/k3s/registries.yaml

cat > /var/lib/rancher/k3s/server/manifests/traefik-config.yaml <<'EOF'
apiVersion: helm.cattle.io/v1
kind: HelmChartConfig
metadata:
  name: traefik
  namespace: kube-system
spec:
  valuesContent: |-
    nodeSelector:
      node-role.kubernetes.io/control-plane: "true"
    updateStrategy:
      type: Recreate
    service:
      spec:
        type: ClusterIP
    ports:
      web:
        hostPort: 80
        http:
          redirections:
            entryPoint:
              to: websecure
              scheme: https
              permanent: true
      websecure:
        hostPort: 443
EOF

installer=$(mktemp)
curl -sfL https://get.k3s.io -o "$installer"
trap 'if [ $? -ne 0 ]; then echo "Installing Harblet failed. To start over, run /usr/local/bin/k3s-uninstall.sh and then this script again." >&2; fi' EXIT
INSTALL_K3S_VERSION="$k3s_version" sh "$installer"
rm -f "$installer"

if ! timeout 300 sh -c 'until k3s kubectl get --raw /readyz >/dev/null 2>&1; do sleep 2; done'; then
  echo "k3s didn't become ready within 5 minutes." >&2
  exit 1
fi

k3s kubectl apply --server-side --field-manager=harblet -f - <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: harblet-system
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: harblet
  namespace: harblet-system
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: harblet
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
- kind: ServiceAccount
  name: harblet
  namespace: harblet-system
---
apiVersion: v1
kind: Secret
metadata:
  name: registry-pull
  namespace: harblet-system
type: Opaque
stringData:
  password: $pull_password
---
apiVersion: v1
kind: Secret
metadata:
  name: harblet
  namespace: harblet-system
type: Opaque
stringData:
  app-secret: ${app_secret:-$(openssl rand -hex 32)}
  database-password: $(openssl rand -hex 32)
---
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: harblet-system
  labels:
    app.kubernetes.io/name: postgres
    app.kubernetes.io/managed-by: harblet
spec:
  selector:
    app.kubernetes.io/name: postgres
  ports:
  - name: postgres
    port: 5432
    targetPort: postgres
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: harblet-system
  labels:
    app.kubernetes.io/name: postgres
    app.kubernetes.io/managed-by: harblet
spec:
  replicas: 1
  serviceName: postgres
  selector:
    matchLabels:
      app.kubernetes.io/name: postgres
  template:
    metadata:
      labels:
        app.kubernetes.io/name: postgres
        app.kubernetes.io/managed-by: harblet
    spec:
      nodeSelector:
        node-role.kubernetes.io/control-plane: "true"
      automountServiceAccountToken: false
      securityContext:
        runAsUser: 999
        runAsGroup: 999
      containers:
      - name: postgres
        image: postgres:18
        env:
        - name: POSTGRES_USER
          value: harblet
        - name: POSTGRES_DB
          value: harblet
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: harblet
              key: database-password
        ports:
        - name: postgres
          containerPort: 5432
        readinessProbe:
          exec:
            command: [pg_isready, -h, 127.0.0.1, -U, harblet, -d, harblet]
        volumeMounts:
        - name: data
          mountPath: /var/lib/postgresql
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: [ReadWriteOnce]
      storageClassName: local-path
      resources:
        requests:
          storage: 10Gi
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: postgres
  namespace: harblet-system
  labels:
    app.kubernetes.io/name: postgres
    app.kubernetes.io/managed-by: harblet
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: postgres
  policyTypes: [Ingress]
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app.kubernetes.io/name: harblet
    ports:
    - port: 5432
EOF

if [ -n "$backup" ]; then
  k3s kubectl -n harblet-system rollout status statefulset/postgres --timeout=10m
  k3s kubectl -n harblet-system exec -i postgres-0 -- pg_restore -U harblet -d harblet --exit-on-error < "$backup"
fi

k3s kubectl apply --server-side --field-manager=harblet -f - <<EOF
apiVersion: v1
kind: Service
metadata:
  name: harblet
  namespace: harblet-system
  labels:
    app.kubernetes.io/name: harblet
    app.kubernetes.io/managed-by: harblet
spec:
  type: LoadBalancer
  selector:
    app.kubernetes.io/name: harblet
  ports:
  - name: http
    port: 3000
    targetPort: http
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: harblet
  namespace: harblet-system
  labels:
    app.kubernetes.io/name: harblet
    app.kubernetes.io/managed-by: harblet
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app.kubernetes.io/name: harblet
  template:
    metadata:
      labels:
        app.kubernetes.io/name: harblet
        app.kubernetes.io/managed-by: harblet
    spec:
      serviceAccountName: harblet
      nodeSelector:
        node-role.kubernetes.io/control-plane: "true"
      initContainers:
      - name: wait-for-postgres
        image: postgres:18
        command: [sh, -c, "until pg_isready -h postgres -U harblet -d harblet; do sleep 1; done"]
      containers:
      - name: harblet
        image: $image
        env:
        - name: DATABASE_PASSWORD
          valueFrom:
            secretKeyRef:
              name: harblet
              key: database-password
        - name: NUXT_DATABASE_URL
          value: postgresql://harblet:\$(DATABASE_PASSWORD)@postgres:5432/harblet
        - name: NUXT_APP_SECRET
          valueFrom:
            secretKeyRef:
              name: harblet
              key: app-secret
        - name: NUXT_PUBLIC_SITE_URL
          value: $url
        ports:
        - name: http
          containerPort: 3000
        readinessProbe:
          httpGet:
            path: /api/setup
            port: http
EOF

k3s kubectl -n harblet-system rollout status deployment/harblet --timeout=10m

if [ -n "$backup" ]; then
  echo "Harblet is ready with the restored backup. Open $url and log in."
else
  echo "Harblet is ready. Open $url to create the first account."
fi
