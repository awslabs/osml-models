/*
 * Copyright 2025 Amazon.com, Inc. or its affiliates.
 */

import { Names } from "aws-cdk-lib";
import {
  CfnEndpoint,
  CfnEndpointConfig,
  CfnModel
} from "aws-cdk-lib/aws-sagemaker";
import { Construct } from "constructs";

/**
 * Configuration for SageMaker endpoint settings.
 */
export class SageMakerEndpointConfig {
  /**
   * Initial number of instances for the endpoint.
   */
  public readonly INITIAL_INSTANCE_COUNT: number;

  /**
   * Initial variant weight for traffic distribution.
   */
  public readonly INITIAL_VARIANT_WEIGHT: number;

  /**
   * Name of the production variant.
   */
  public readonly VARIANT_NAME: string;

  /**
   * Security group ID for the endpoint.
   */
  public readonly SECURITY_GROUP_ID: string;

  /**
   * Environment variables for the container.
   */
  public readonly CONTAINER_ENV: Record<string, string>;

  /**
   * Repository access mode for SageMaker.
   */
  public readonly REPOSITORY_ACCESS_MODE: string;

  constructor(config?: Partial<SageMakerEndpointConfig>) {
    this.INITIAL_INSTANCE_COUNT = config?.INITIAL_INSTANCE_COUNT ?? 1;
    this.INITIAL_VARIANT_WEIGHT = config?.INITIAL_VARIANT_WEIGHT ?? 1;
    this.VARIANT_NAME = config?.VARIANT_NAME ?? "AllTraffic";
    this.SECURITY_GROUP_ID = config?.SECURITY_GROUP_ID ?? "";
    this.CONTAINER_ENV = config?.CONTAINER_ENV ?? {};
    this.REPOSITORY_ACCESS_MODE = config?.REPOSITORY_ACCESS_MODE ?? "Platform";
  }
}

/**
 * Properties for the MESageMakerEndpoint construct.
 */
export interface SageMakerEndpointProps {
  /**
   * ARN of the IAM role for SageMaker execution.
   */
  roleArn: string;

  /**
   * URI of the container image.
   */
  containerImageUri: string;

  /**
   * Name for the SageMaker model.
   */
  modelName: string;

  /**
   * Instance type for the endpoint (e.g., ml.g4dn.xlarge).
   */
  instanceType: string;

  /**
   * List of subnet IDs for VPC configuration.
   */
  subnetIds: string[];

  /**
   * Optional endpoint configuration.
   */
  config?: SageMakerEndpointConfig;
}

/**
 * Construct for creating a SageMaker endpoint with model and endpoint configuration.
 */
export class MESageMakerEndpoint extends Construct {
  /**
   * The SageMaker endpoint configuration.
   */
  public readonly endpointConfig: CfnEndpointConfig;

  /**
   * The SageMaker endpoint.
   */
  public readonly endpoint: CfnEndpoint;

  /**
   * The SageMaker model.
   */
  public readonly model: CfnModel;

  constructor(scope: Construct, id: string, props: SageMakerEndpointProps) {
    super(scope, id);

    const config = props.config ?? new SageMakerEndpointConfig();

    // Create CfnModel with container image, execution role, and VPC configuration
    // Use a unique name with model name prefix to allow CloudFormation to manage replacements
    // while maintaining readability.
    const uniqueSuffix = Names.uniqueId(this).slice(-8); // Last 8 chars of hash
    const modelName = `${props.modelName}-${uniqueSuffix}`.substring(0, 63);

    this.model = new CfnModel(this, "Model", {
      modelName: modelName,
      executionRoleArn: props.roleArn,
      primaryContainer: {
        image: props.containerImageUri,
        mode: "SingleModel",
        environment: config.CONTAINER_ENV
      },
      vpcConfig:
        props.subnetIds.length > 0
          ? {
              subnets: props.subnetIds,
              securityGroupIds: config.SECURITY_GROUP_ID
                ? [config.SECURITY_GROUP_ID]
                : []
            }
          : undefined
    });

    // Create CfnEndpointConfig with instance type and variant settings
    const configSuffix = Names.uniqueId(this).slice(-8);
    const configName = `${props.modelName}-config-${configSuffix}`.substring(
      0,
      63
    );

    this.endpointConfig = new CfnEndpointConfig(this, "EndpointConfig", {
      endpointConfigName: configName,
      productionVariants: [
        {
          variantName: config.VARIANT_NAME,
          modelName: this.model.attrModelName,
          initialInstanceCount: config.INITIAL_INSTANCE_COUNT,
          initialVariantWeight: config.INITIAL_VARIANT_WEIGHT,
          instanceType: props.instanceType
        }
      ]
    });

    // Ensure endpoint config depends on model
    this.endpointConfig.addDependency(this.model);

    // Create CfnEndpoint with endpoint name
    const endpointSuffix = Names.uniqueId(this).slice(-8);
    const endpointName =
      `${props.modelName}-endpoint-${endpointSuffix}`.substring(0, 63);

    this.endpoint = new CfnEndpoint(this, "Endpoint", {
      endpointName: endpointName,
      endpointConfigName: this.endpointConfig.attrEndpointConfigName
    });

    // Ensure endpoint depends on endpoint config
    this.endpoint.addDependency(this.endpointConfig);
  }
}
