/**
 * Copyright 2025 Amazon.com, Inc. or its affiliates.
 */

/**
 * @file NetworkStack for deploying VPC and networking infrastructure.
 *
 * This stack deploys the Network construct which includes:
 * - VPC with public and private subnets
 * - Security groups
 * - VPC flow logs (for production environments)
 * - NAT Gateway for private subnet egress
 */

import { CfnOutput, Environment, Stack, StackProps } from "aws-cdk-lib";
import { IVpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

import { DeploymentConfig } from "../bin/deployment/load-deployment";
import { Network, NetworkConfig } from "./constructs/model-endpoint/network";

/**
 * Properties for the Network Stack.
 */
export interface NetworkStackProps extends StackProps {
  /** AWS environment configuration (account and region). */
  env: Environment;

  /** Deployment configuration containing network settings. */
  deployment: DeploymentConfig;

  /** Optional existing VPC to import instead of creating a new one. */
  vpc?: IVpc;
}

/**
 * Network Stack that manages VPC, subnets, and security groups.
 *
 * This stack creates or imports VPC resources based on the deployment configuration.
 * When VPC_ID is provided, it imports an existing VPC. Otherwise, it creates a new VPC
 * with public and private subnets across multiple availability zones.
 */
export class NetworkStack extends Stack {
  /** The network construct containing VPC and security groups. */
  public readonly network: Network;

  /**
   * Creates a new Network Stack.
   *
   * @param scope - The parent construct
   * @param id - The construct ID
   * @param props - Stack properties including deployment configuration
   */
  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { deployment } = props;

    // Create Network construct using deployment configuration
    // The Network construct will handle VPC import or creation based on the config
    const networkConfig = deployment.networkConfig
      ? new NetworkConfig(deployment.networkConfig as Record<string, unknown>)
      : new NetworkConfig();

    this.network = new Network(this, "Network", {
      account: {
        id: deployment.account.id,
        region: deployment.account.region,
        prodLike: deployment.account.prodLike,
        isAdc: deployment.account.isAdc
      },
      config: networkConfig,
      vpc: props.vpc
    });

    // Export VPC ID
    new CfnOutput(this, "VpcId", {
      value: this.network.vpc.vpcId,
      description: "VPC ID",
      exportName: `${deployment.projectName}-VpcId`
    });

    // Export security group ID
    new CfnOutput(this, "SecurityGroupId", {
      value: this.network.securityGroup.securityGroupId,
      description: "Security Group ID",
      exportName: `${deployment.projectName}-SecurityGroupId`
    });
  }
}
