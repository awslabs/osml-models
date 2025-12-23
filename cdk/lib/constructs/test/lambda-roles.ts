/*
 * Copyright 2023-2025 Amazon.com, Inc. or its affiliates.
 */

import {
  Effect,
  IRole,
  PolicyStatement,
  Role,
  ServicePrincipal
} from "aws-cdk-lib/aws-iam";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

import { OSMLAccount } from "../types";

/**
 * Properties for creating the Lambda role.
 */
export interface LambdaRoleProps {
  /** The OSML account configuration. */
  readonly account: OSMLAccount;
  /** The name for the Lambda role. */
  readonly roleName: string;
  /** Optional existing Lambda role to use instead of creating a new one. */
  readonly existingLambdaRole?: IRole;
  /** The SageMaker endpoint name to grant invoke permissions. */
  readonly endpointName: string;
  /** The S3 bucket ARN for test imagery access. */
  readonly testBucketArn: string;
  /** The project name for CloudWatch Logs permissions. */
  readonly projectName: string;
}

/**
 * Lambda role construct for integration test Lambda function.
 */
export class LambdaRole extends Construct {
  /** The Lambda execution role. */
  public readonly lambdaRole: IRole;

  /**
   * Creates a new LambdaRole construct.
   *
   * @param scope - The scope/stack in which to define this construct
   * @param id - The id of this construct within the current scope
   * @param props - The properties for configuring this construct
   */
  constructor(scope: Construct, id: string, props: LambdaRoleProps) {
    super(scope, id);

    if (props.existingLambdaRole) {
      this.lambdaRole = props.existingLambdaRole;
    } else {
      // Create new Lambda role
      const role = new Role(this, "Role", {
        roleName: props.roleName,
        assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
        description: `IAM role for ${props.projectName} integration test Lambda function`
      });

      // Add permissions to invoke SageMaker endpoint
      role.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["sagemaker:InvokeEndpoint"],
          resources: [
            `arn:aws:sagemaker:${props.account.region}:${props.account.id}:endpoint/${props.endpointName}`
          ]
        })
      );

      // Add permissions for S3 access to test bucket
      role.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["s3:GetObject", "s3:ListBucket"],
          resources: [props.testBucketArn, `${props.testBucketArn}/*`]
        })
      );

      // Add permissions for CloudWatch Logs
      role.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents"
          ],
          resources: [
            `arn:aws:logs:${props.account.region}:${props.account.id}:log-group:/aws/lambda/${props.projectName}-integration-test:*`
          ]
        })
      );

      // Add VPC permissions for Lambda
      role.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [
            "ec2:CreateNetworkInterface",
            "ec2:DescribeNetworkInterfaces",
            "ec2:DeleteNetworkInterface",
            "ec2:AssignPrivateIpAddresses",
            "ec2:UnassignPrivateIpAddresses"
          ],
          resources: ["*"]
        })
      );

      // Suppress IAM wildcard permissions for VPC network interface management
      NagSuppressions.addResourceSuppressions(
        role,
        [
          {
            id: "AwsSolutions-IAM5",
            reason:
              "Lambda VPC execution requires wildcard permissions for EC2 network interface management. " +
              "These permissions (CreateNetworkInterface, DescribeNetworkInterfaces, DeleteNetworkInterface) " +
              "cannot be scoped to specific resources as the network interface IDs are dynamically generated. " +
              "S3 bucket permissions include wildcard for object access which is required for test image retrieval.",
            appliesTo: ["Resource::*"]
          }
        ],
        true
      );

      this.lambdaRole = role;
    }
  }
}
