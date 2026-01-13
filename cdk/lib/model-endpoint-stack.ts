/**
 * Copyright 2025-2026 Amazon.com, Inc. or its affiliates.
 */

import { CfnOutput, Environment, Stack, StackProps } from "aws-cdk-lib";
import { ISecurityGroup, IVpc, SubnetSelection } from "aws-cdk-lib/aws-ec2";
import { IRole } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

import { DeploymentConfig } from "../bin/deployment/load-deployment";
import {
  Dataplane,
  DataplaneConfig,
} from "./constructs/model-endpoint/dataplane";

/**
 * Properties for the Model Endpoint Stack.
 */
export interface ModelEndpointStackProps extends StackProps {
  /** AWS environment configuration (account and region). */
  env: Environment;

  /** Deployment configuration containing model endpoint settings. */
  deployment: DeploymentConfig;

  /** VPC for the model endpoint. */
  vpc: IVpc;

  /** Selected subnets for the model endpoint. */
  selectedSubnets: SubnetSelection;

  /** Security group for the model endpoint. */
  securityGroup: ISecurityGroup;

  /** SageMaker execution role for the model endpoint. */
  sagemakerRole: IRole;
}

/**
 * Model Endpoint Stack that deploys SageMaker endpoints for ML models.
 *
 * This stack creates the model endpoint dataplane with:
 * - Container image management (build from source or pull from registry)
 * - SageMaker endpoint with GPU instance type
 * - VPC and security group configuration
 *
 * Note: The SageMaker IAM execution role is created in a separate stack
 * (SageMakerRole stack) to ensure proper cleanup of ENI resources.
 */
export class ModelEndpointStack extends Stack {
  /** The dataplane resources created by this stack. */
  public readonly resources: Dataplane;

  /** The VPC used by this stack. */
  public readonly vpc: IVpc;

  /** The endpoint name for cross-stack references. */
  public readonly endpointName: string;

  /**
   * Creates a new Model Endpoint Stack.
   *
   * @param scope - The parent construct
   * @param id - The construct ID
   * @param props - Stack properties including deployment configuration and VPC
   */
  constructor(scope: Construct, id: string, props: ModelEndpointStackProps) {
    super(scope, id, {
      terminationProtection: props.deployment.account.prodLike,
      ...props,
    });

    const { deployment, vpc, selectedSubnets, securityGroup, sagemakerRole } =
      props;

    // Store VPC reference
    this.vpc = vpc;

    // Create the model endpoint dataplane using configuration
    const dataplaneConfig = deployment.modelEndpointConfig
      ? new DataplaneConfig(deployment.modelEndpointConfig)
      : undefined;

    this.resources = new Dataplane(this, "Dataplane", {
      account: deployment.account,
      vpc,
      securityGroup,
      subnetSelection: selectedSubnets,
      projectName: deployment.projectName,
      sagemakerRole,
      config: dataplaneConfig,
    });

    // Expose the endpoint name for cross-stack references
    this.endpointName =
      this.resources.modelEndpoint.endpoint.endpointName || "";

    // Export endpoint name as CloudFormation output
    new CfnOutput(this, "EndpointName", {
      value: this.endpointName,
      description: "SageMaker Endpoint Name",
      exportName: `${deployment.projectName}-EndpointName`,
    });
  }
}
