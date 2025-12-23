/*
 * Copyright 2025 Amazon.com, Inc. or its affiliates.
 */

import {
  Effect,
  PolicyStatement,
  Role,
  ServicePrincipal
} from "aws-cdk-lib/aws-iam";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

/**
 * Properties for the SageMaker execution role.
 */
export interface SageMakerRoleProps {
  /**
   * Account configuration.
   */
  account: {
    /**
     * AWS account ID.
     */
    id: string;

    /**
     * AWS region.
     */
    region: string;

    /**
     * Whether this is a production-like environment.
     */
    prodLike?: boolean;
  };

  /**
   * Name for the IAM role.
   */
  roleName: string;
}

/**
 * Construct for creating a SageMaker execution role with necessary permissions.
 */
export class MESageMakerRole extends Construct {
  /**
   * The IAM role for SageMaker execution.
   */
  public readonly role: Role;

  constructor(scope: Construct, id: string, props: SageMakerRoleProps) {
    super(scope, id);

    // Create IAM role with trust relationship for SageMaker
    this.role = new Role(this, "Role", {
      roleName: props.roleName,
      assumedBy: new ServicePrincipal("sagemaker.amazonaws.com"),
      description: "Execution role for SageMaker model endpoints"
    });

    // Add ECR permissions for pulling container images
    this.role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          "ecr:GetAuthorizationToken",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer"
        ],
        resources: ["*"]
      })
    );

    // Add S3 permissions for model artifacts
    this.role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["s3:GetObject", "s3:PutObject"],
        resources: ["*"]
      })
    );

    // Add CloudWatch Logs permissions
    this.role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
        resources: ["*"]
      })
    );

    // Add VPC permissions for SageMaker endpoints deployed in VPC
    this.role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          "ec2:CreateNetworkInterface",
          "ec2:CreateNetworkInterfacePermission",
          "ec2:DeleteNetworkInterface",
          "ec2:DeleteNetworkInterfacePermission",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DescribeVpcs",
          "ec2:DescribeDhcpOptions",
          "ec2:DescribeSubnets",
          "ec2:DescribeSecurityGroups"
        ],
        resources: ["*"]
      })
    );

    // Suppress IAM wildcard permissions for SageMaker role
    NagSuppressions.addResourceSuppressions(
      this.role,
      [
        {
          id: "AwsSolutions-IAM5",
          reason:
            "SageMaker execution role requires wildcard permissions for ECR (GetAuthorizationToken), " +
            "S3 (model artifacts access), CloudWatch Logs (log streaming), and EC2 (VPC network interface management). " +
            "These are standard permissions required for SageMaker endpoint operation in a VPC.",
          appliesTo: ["Resource::*"]
        }
      ],
      true
    );
  }

  /**
   * Gets the ARN of the IAM role.
   */
  public get roleArn(): string {
    return this.role.roleArn;
  }
}
