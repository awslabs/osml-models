/*
 * Copyright 2025-2026 Amazon.com, Inc. or its affiliates.
 */

import {
  ContainerImage,
  Endpoint,
  EndpointConfig,
  InstanceType,
  Model,
} from "@aws-cdk/aws-sagemaker-alpha";
import { ISecurityGroup, IVpc, SubnetSelection } from "aws-cdk-lib/aws-ec2";
import { IRole } from "aws-cdk-lib/aws-iam";
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
   * IAM role for SageMaker execution.
   */
  role: IRole;

  /**
   * Container image for the model.
   */
  containerImage: ContainerImage;

  /**
   * Name for the SageMaker endpoint (will be used as endpoint name).
   */
  endpointName: string;

  /**
   * Instance type for the endpoint.
   */
  instanceType: InstanceType;

  /**
   * VPC for the endpoint.
   */
  vpc: IVpc;

  /**
   * VPC subnet selection for the endpoint.
   */
  subnetSelection?: SubnetSelection;

  /**
   * Security groups for the endpoint.
   */
  securityGroups?: ISecurityGroup[];

  /**
   * Optional endpoint configuration.
   */
  config?: SageMakerEndpointConfig;
}

/**
 * Construct for creating a SageMaker endpoint with model and endpoint configuration.
 * Uses L2 constructs from @aws-cdk/aws-sagemaker-alpha for better abstraction.
 */
export class MESageMakerEndpoint extends Construct {
  /**
   * The SageMaker endpoint configuration.
   */
  public readonly endpointConfig: EndpointConfig;

  /**
   * The SageMaker endpoint.
   */
  public readonly endpoint: Endpoint;

  /**
   * The SageMaker model.
   */
  public readonly model: Model;

  constructor(scope: Construct, id: string, props: SageMakerEndpointProps) {
    super(scope, id);

    const config = props.config ?? new SageMakerEndpointConfig();

    // Create Model using L2 construct
    // The L2 construct handles VPC configuration, environment variables, and other settings
    this.model = new Model(this, "Model", {
      containers: [
        {
          image: props.containerImage,
          environment: config.CONTAINER_ENV,
        },
      ],
      role: props.role,
      vpc: props.vpc,
      vpcSubnets: props.subnetSelection,
      securityGroups: props.securityGroups,
    });

    // Create EndpointConfig using L2 construct
    // The L2 construct provides better defaults and type safety
    this.endpointConfig = new EndpointConfig(this, "EndpointConfig", {
      instanceProductionVariants: [
        {
          model: this.model,
          variantName: config.VARIANT_NAME,
          initialVariantWeight: config.INITIAL_VARIANT_WEIGHT,
          instanceType: props.instanceType,
          initialInstanceCount: config.INITIAL_INSTANCE_COUNT,
        },
      ],
    });

    // Create Endpoint using L2 construct
    // The endpoint name is kept constant so it doesn't change when instance type changes
    const endpointName = props.endpointName.substring(0, 63);

    this.endpoint = new Endpoint(this, "Endpoint", {
      endpointName: endpointName,
      endpointConfig: this.endpointConfig,
    });
  }
}
