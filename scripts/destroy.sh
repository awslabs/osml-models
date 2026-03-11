#!/usr/bin/env bash
# Copyright 2026 Amazon.com, Inc. or its affiliates.
#
# Destroys CDK stacks in the correct dependency order:
#   Wave 1: Dataplane and IntegrationTest in parallel (both depend on Network)
#   Wave 2: Network stack (after wave 1 completes)
#   Wave 3: SageMakerRole stack (Network depends on it for ENI cleanup)
#
# Usage: ./scripts/destroy.sh <project_name>
#   project_name: CDK project name prefix (e.g. OSML-Models)

set -euo pipefail

PROJECT_NAME="${1:?Usage: $0 <project_name>}"

# Wave 1: Destroy Dataplane and IntegrationTest in parallel
echo "Wave 1: Destroying Dataplane and IntegrationTest stacks..."

cdk destroy "${PROJECT_NAME}-Dataplane" --exclusively --app cdk.out --force &
PID_DP=$!

PID_IT=""
if aws cloudformation describe-stacks --stack-name "${PROJECT_NAME}-IntegrationTest" > /dev/null 2>&1; then
  cdk destroy "${PROJECT_NAME}-IntegrationTest" --exclusively --app cdk.out --force &
  PID_IT=$!
else
  echo "Integration test stack not found, skipping"
fi

FAILED=0
wait ${PID_DP} || { echo "::error::Dataplane stack destroy failed"; FAILED=1; }
if [ -n "${PID_IT}" ]; then
  wait ${PID_IT} || { echo "::error::IntegrationTest stack destroy failed"; FAILED=1; }
fi

if [ ${FAILED} -ne 0 ]; then
  echo "::error::One or more stack destroys failed in wave 1"
  exit 1
fi

echo "Wave 1 complete."

# Wave 2: Destroy Network stack (Dataplane and IntegrationTest depend on it)
echo "Wave 2: Destroying Network stack..."
cdk destroy "${PROJECT_NAME}-Network" --exclusively --app cdk.out --force

# Wave 3: Destroy SageMakerRole stack (Network depends on it)
echo "Wave 3: Destroying SageMakerRole stack..."
cdk destroy "${PROJECT_NAME}-SageMakerRole" --exclusively --app cdk.out --force

echo "All stacks destroyed successfully."
