#!/bin/bash

#
# Copyright 2023-2025 Amazon.com, Inc. or its affiliates.
#

# This is a utility script to help building and uploading the OSML default test model to an account's ECR
# repository deployed by the the cdk constructs or a custom ECR.
#
# Example usage: ./ecr_push.sh us-east-1 sample-user sample-user-osml-models sample-tag
#                ./ecr_push.sh us-east-2

# Grab user inputs or set default values
REGION="${1:-us-west-2}"
NAME="${2:-$USER}"
REPO=$NAME-"${3:-osml-models}"
TAG="${4:-latest}"

# Grab the account id for the loaded AWS credentials
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text) || exit 1

# Login to to Docker with garnered ECR credentials
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ACCOUNT_ID".dkr.ecr."$REGION".amazonaws.com

# Build the container locally with Docker
docker build . -t "$REPO" -f docker/Dockerfile

# Tag the model for upload to ECR
docker tag "$REPO":latest "$ACCOUNT_ID".dkr.ecr."$REGION".amazonaws.com/"$REPO":"$TAG"

# See if the repository exists, if not create it
aws --no-cli-pager --region "$REGION" ecr describe-repositories --repository-names "$REPO" \
  || (echo Creating ECR "$REPO" && aws --no-cli-pager --region "$REGION" ecr create-repository --repository-name "$REPO")

# Push to remote ECR repository
docker push "$ACCOUNT_ID".dkr.ecr."$REGION".amazonaws.com/"$REPO":"$TAG"
