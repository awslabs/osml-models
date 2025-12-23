/*
 * Copyright 2025 Amazon.com, Inc. or its affiliates.
 */

import { RemovalPolicy } from "aws-cdk-lib";
import { ISecurityGroup, IVpc, SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { IRole, Role } from "aws-cdk-lib/aws-iam";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

import { BaseConfig, ConfigType, OSMLAccount } from "../types";
import { ContainerConfig, OSMLContainer } from "./container";
import { MESageMakerRole } from "./roles/sagemaker-role";
import {
  MESageMakerEndpoint,
  SageMakerEndpointConfig
} from "./sagemaker-endpoint";

/**
 * Configuration class for Model Endpoint Dataplane Construct.
 */
export class DataplaneConfig extends BaseConfig {
  /**
   * Whether to build container resources from source.
   * @default true
   */
  public readonly BUILD_FROM_SOURCE: boolean;

  /**
   * The container image URI (used when BUILD_FROM_SOURCE=false).
   * @default "awsosml/osml-models:latest"
   */
  public readonly CONTAINER_URI: string;

  /**
   * The build path for the container.
   * @default ".."
   */
  public readonly CONTAINER_BUILD_PATH: string;

  /**
   * The build target for the container.
   * @default undefined
   */
  public readonly CONTAINER_BUILD_TARGET?: string;

  /**
   * The path to Dockerfile to use to build the container.
   * @default "docker/Dockerfile"
   */
  public readonly CONTAINER_DOCKERFILE: string;

  /**
   * The SageMaker instance type for the endpoint.
   * @default "ml.g4dn.xlarge"
   */
  public readonly INSTANCE_TYPE: string;

  /**
   * The model name for the SageMaker endpoint.
   * @default "aircraft"
   */
  public readonly MODEL_NAME: string;

  /**
   * Initial number of instances for the endpoint.
   * @default 1
   */
  public readonly INITIAL_INSTANCE_COUNT: number;

  /**
   * Initial variant weight for traffic distribution.
   * @default 1
   */
  public readonly INITIAL_VARIANT_WEIGHT: number;

  /**
   * Name of the production variant.
   * @default "AllTraffic"
   */
  public readonly VARIANT_NAME: string;

  /**
   * The name of the SageMaker execution role (optional, for importing existing role).
   * @default undefined
   */
  public readonly SAGEMAKER_ROLE_NAME?: string;

  /**
   * The security group ID to use for the Model Endpoint components.
   * @default undefined
   */
  public readonly SECURITY_GROUP_ID?: string;

  /**
   * Constructor for DataplaneConfig.
   * @param config - The configuration object for the Dataplane.
   */
  constructor(config: Partial<ConfigType> = {}) {
    const mergedConfig = {
      BUILD_FROM_SOURCE: true,
      CONTAINER_URI: "awsosml/osml-models:latest",
      CONTAINER_BUILD_PATH: "..",
      CONTAINER_DOCKERFILE: "docker/Dockerfile",
      INSTANCE_TYPE: "ml.g4dn.xlarge",
      MODEL_NAME: "aircraft",
      INITIAL_INSTANCE_COUNT: 1,
      INITIAL_VARIANT_WEIGHT: 1,
      VARIANT_NAME: "AllTraffic",
      ...config
    };
    super(mergedConfig);

    this.validateConfig(mergedConfig);
  }

  /**
   * Validates the configuration values.
   *
   * @param config - The configuration to validate
   * @throws Error if validation fails
   */
  private validateConfig(config: Record<string, unknown>): void {
    const errors: string[] = [];

    // Validate instance count
    const instanceCount =
      typeof config.INITIAL_INSTANCE_COUNT === "number"
        ? config.INITIAL_INSTANCE_COUNT
        : 1;
    if (instanceCount < 1) {
      errors.push("INITIAL_INSTANCE_COUNT must be at least 1");
    }

    // Validate variant weight
    const variantWeight =
      typeof config.INITIAL_VARIANT_WEIGHT === "number"
        ? config.INITIAL_VARIANT_WEIGHT
        : 1;
    if (variantWeight < 0 || variantWeight > 1) {
      errors.push("INITIAL_VARIANT_WEIGHT must be between 0 and 1");
    }

    // Validate model name
    const modelName = config.MODEL_NAME as string;
    if (!modelName || modelName.trim() === "") {
      errors.push("MODEL_NAME must be a non-empty string");
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join("\n")}`);
    }
  }
}

/**
 * Interface representing properties for configuring the Dataplane Construct.
 */
export interface DataplaneProps {
  /**
   * The OSML deployment account.
   */
  readonly account: OSMLAccount;

  /**
   * The VPC for the Dataplane.
   */
  readonly vpc: IVpc;

  /**
   * The optional security group for the Dataplane.
   */
  readonly securityGroup?: ISecurityGroup;

  /**
   * The subnet IDs for VPC configuration.
   */
  readonly subnetIds: string[];

  /**
   * The project name for resource naming.
   */
  readonly projectName: string;

  /**
   * Custom configuration for the Dataplane Construct (optional).
   */
  config?: DataplaneConfig;
}

/**
 * Represents the Model Endpoint Dataplane construct responsible for managing
 * the data plane of the model endpoint application. It handles various AWS
 * resources and configurations required for the application's operation.
 *
 * @param scope - The scope/stack in which to define this construct.
 * @param id - The id of this construct within the current scope.
 * @param props - The properties of this construct.
 * @returns The Dataplane construct.
 */
export class Dataplane extends Construct {
  /**
   * The configuration for the Dataplane.
   */
  public readonly config: DataplaneConfig;

  /**
   * The removal policy for resources created by this construct.
   */
  public readonly removalPolicy: RemovalPolicy;

  /**
   * The SageMaker execution role.
   */
  public readonly sagemakerRole: MESageMakerRole;

  /**
   * The container construct for the model.
   */
  public readonly container: OSMLContainer;

  /**
   * The aircraft detection SageMaker endpoint.
   */
  public readonly aircraftEndpoint: MESageMakerEndpoint;

  /**
   * The security group for the Dataplane.
   */
  public readonly securityGroup?: ISecurityGroup;

  /**
   * Constructs an instance of Dataplane.
   *
   * @param scope - The scope/stack in which to define this construct.
   * @param id - The id of this construct within the current scope.
   * @param props - The properties of this construct.
   */
  constructor(scope: Construct, id: string, props: DataplaneProps) {
    super(scope, id);

    // Initialize configuration and policies
    this.config = this.initializeConfig(props);
    this.removalPolicy = this.initializeRemovalPolicy(props);
    this.securityGroup = this.initializeSecurityGroup(props);

    // Create resources in dependency order
    this.sagemakerRole = this.createSageMakerRole(props);
    this.container = this.createContainer(props);
    this.aircraftEndpoint = this.createSageMakerEndpoint(props);

    // Apply CDK-Nag suppressions for CDK custom resources if building from source
    if (this.container.dockerImageAsset) {
      NagSuppressions.addResourceSuppressions(
        this.container.dockerImageAsset,
        [
          {
            id: "AwsSolutions-IAM4",
            reason:
              "AWS managed policies are used for CDK custom resource Lambda execution roles. " +
              "These are required for CDK asset management and cannot be replaced with custom policies.",
            appliesTo: [
              "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
            ]
          },
          {
            id: "AwsSolutions-L1",
            reason:
              "Lambda runtime versions are managed by CDK for custom resources. " +
              "These Lambda functions are created by CDK for asset management and " +
              "their runtime versions are controlled by the CDK framework version."
          }
        ],
        true
      );
    }
  }

  /**
   * Creates the SageMaker execution role.
   *
   * @param props - The Dataplane properties
   * @returns The SageMaker role construct
   */
  private createSageMakerRole(props: DataplaneProps): MESageMakerRole {
    // Check if we should import an existing role
    if (this.config.SAGEMAKER_ROLE_NAME) {
      const existingRole = Role.fromRoleName(
        this,
        "ImportedSageMakerRole",
        this.config.SAGEMAKER_ROLE_NAME,
        { mutable: false }
      );
      // Return a wrapper that exposes the imported role
      return this.createRoleWrapper(existingRole, props);
    }

    return new MESageMakerRole(this, "SageMakerRole", {
      account: {
        id: props.account.id,
        region: props.account.region,
        prodLike: props.account.prodLike
      },
      roleName: `${props.projectName}-sagemaker-role`
    });
  }

  /**
   * Creates a wrapper for an imported role to match MESageMakerRole interface.
   *
   * @param _role - The imported IAM role (unused, kept for interface compatibility)
   * @param props - The Dataplane properties
   * @returns A MESageMakerRole-compatible construct
   */
  private createRoleWrapper(
    _role: IRole,
    props: DataplaneProps
  ): MESageMakerRole {
    // For imported roles, we still create the construct but it won't create new resources
    return new MESageMakerRole(this, "SageMakerRole", {
      account: {
        id: props.account.id,
        region: props.account.region,
        prodLike: props.account.prodLike
      },
      roleName: `${props.projectName}-sagemaker-role`
    });
  }

  /**
   * Creates the container construct.
   *
   * @param props - The Dataplane properties
   * @returns The container construct
   */
  private createContainer(props: DataplaneProps): OSMLContainer {
    const containerConfig = new ContainerConfig({
      CONTAINER_URI: this.config.CONTAINER_URI,
      CONTAINER_BUILD_PATH: this.config.CONTAINER_BUILD_PATH,
      CONTAINER_BUILD_TARGET: this.config.CONTAINER_BUILD_TARGET,
      CONTAINER_DOCKERFILE: this.config.CONTAINER_DOCKERFILE
    });

    return new OSMLContainer(this, "Container", {
      account: {
        id: props.account.id,
        region: props.account.region,
        prodLike: props.account.prodLike
      },
      buildFromSource: this.config.BUILD_FROM_SOURCE,
      config: containerConfig
    });
  }

  /**
   * Creates the SageMaker endpoint.
   *
   * @param props - The Dataplane properties
   * @returns The SageMaker endpoint construct
   */
  private createSageMakerEndpoint(props: DataplaneProps): MESageMakerEndpoint {
    // Grant SageMaker role permission to pull from ECR repository if building from source
    if (this.container.dockerImageAsset) {
      this.container.dockerImageAsset.repository.grantPull(
        this.sagemakerRole.role
      );
    }

    const endpointConfig = new SageMakerEndpointConfig({
      INITIAL_INSTANCE_COUNT: this.config.INITIAL_INSTANCE_COUNT,
      INITIAL_VARIANT_WEIGHT: this.config.INITIAL_VARIANT_WEIGHT,
      VARIANT_NAME: this.config.VARIANT_NAME,
      SECURITY_GROUP_ID: this.securityGroup?.securityGroupId ?? "",
      CONTAINER_ENV: {
        MODEL_SELECTION: this.config.MODEL_NAME
      },
      REPOSITORY_ACCESS_MODE: this.container.repositoryAccessMode
    });

    const endpoint = new MESageMakerEndpoint(this, "SageMakerEndpoint", {
      roleArn: this.sagemakerRole.roleArn,
      containerImageUri: this.container.containerUri,
      modelName: this.config.MODEL_NAME,
      instanceType: this.config.INSTANCE_TYPE,
      subnetIds: props.subnetIds,
      config: endpointConfig
    });

    // Ensure the SageMaker model depends on the role's policy being attached
    // This prevents CloudFormation from creating the model before ECR permissions are in place
    if (
      this.container.dockerImageAsset &&
      this.sagemakerRole.role.node.defaultChild
    ) {
      endpoint.model.node.addDependency(this.sagemakerRole.role);
    }

    return endpoint;
  }

  /**
   * Initializes the configuration.
   *
   * @param props - The Dataplane properties
   * @returns The initialized configuration
   */
  private initializeConfig(props: DataplaneProps): DataplaneConfig {
    if (props.config instanceof DataplaneConfig) {
      return props.config;
    }
    return new DataplaneConfig(
      (props.config as unknown as Partial<ConfigType>) ?? {}
    );
  }

  /**
   * Initializes the removal policy based on account type.
   *
   * @param props - The Dataplane properties
   * @returns The removal policy
   */
  private initializeRemovalPolicy(props: DataplaneProps): RemovalPolicy {
    return props.account.prodLike
      ? RemovalPolicy.RETAIN
      : RemovalPolicy.DESTROY;
  }

  /**
   * Initializes security group if specified.
   *
   * @param props - The Dataplane properties
   * @returns The security group or undefined
   */
  private initializeSecurityGroup(
    props: DataplaneProps
  ): ISecurityGroup | undefined {
    if (this.config.SECURITY_GROUP_ID) {
      return SecurityGroup.fromSecurityGroupId(
        this,
        "ImportedSecurityGroup",
        this.config.SECURITY_GROUP_ID
      );
    }
    return props.securityGroup;
  }
}
