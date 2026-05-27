#!/bin/sh
# tests/stress/run-stress.sh
# Script automatizador de pruebas de stress en Docker usando Artillery
# Fase 5: Valida la escalabilidad del sistema hasta 2000+ usuarios concurrentes

set -e

# Detectar la ruta absoluta del script
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "================================================================="
echo " 🔥  INICIANDO PRUEBA DE ESTRES CON ARTILLERY EN DOCKER  🔥"
echo "================================================================="
echo "Red de Docker: sistema_documental_js_gde_network"
echo "Target: http://frontend (Proxy reverso de Nginx)"
echo "Configuración: $SCRIPT_DIR/stress-test.yml"
echo "================================================================="
echo ""

# Ejecutar Artillery usando un contenedor temporal conectado a la red interna de Docker
docker run --rm -i \
  --network sistema_documental_js_gde_network \
  -v "$SCRIPT_DIR:/workspace" \
  -w /workspace \
  artilleryio/artillery:latest \
  run stress-test.yml

echo ""
echo "================================================================="
echo " ✅  PRUEBA DE ESTRES FINALIZADA CON EXITO  ✅"
echo "================================================================="
