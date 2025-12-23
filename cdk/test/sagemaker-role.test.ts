/*
 * Copyright 2025 Amazon.com, Inc. or its affiliates.
 */

import { Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";

import { MESageMakerRole } from "../lib/constructs/model-endpoint/roles/sagemaker-role";
import { createTestApp } from "./test-utils";

describe("MESageMakerRole", () => {
  let stack: Stack;

  beforeEach(() => {
    const app = createTestApp();
    stack = new Stack(app, "TestStack");
  });

  test("creates role with correct trust relationship", () => {
    new MESageMakerRole(stack, "TestRole", {
      account: {
        id: "123456789012",
        region: "us-west-2"
      },
      roleName: "test-sagemaker-role"
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::IAM::Role", {
      RoleName: "test-sagemaker-role",
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
              Service: "sagemaker.amazonaws.com"
            }
          }
        ]
      }
    });
  });

  test("attaches ECR policy", () => {
    new MESageMakerRole(stack, "TestRole", {
      account: {
        id: "123456789012",
        region: "us-west-2"
      },
      roleName: "test-sagemaker-role"
    });

    const template = Template.fromStack(stack);

    // CDK combines all policy statements into a single policy
    // Check that the policy contains the ECR statement
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          {
            Effect: "Allow",
            Action: [
              "ecr:GetAuthorizationToken",
              "ecr:BatchGetImage",
              "ecr:GetDownloadUrlForLayer"
            ],
            Resource: "*"
          }
        ])
      }
    });
  });

  test("attaches S3 policy", () => {
    new MESageMakerRole(stack, "TestRole", {
      account: {
        id: "123456789012",
        region: "us-west-2"
      },
      roleName: "test-sagemaker-role"
    });

    const template = Template.fromStack(stack);

    // CDK combines all policy statements into a single policy
    // Check that the policy contains the S3 statement
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          {
            Effect: "Allow",
            Action: ["s3:GetObject", "s3:PutObject"],
            Resource: "*"
          }
        ])
      }
    });
  });

  test("attaches CloudWatch Logs policy", () => {
    new MESageMakerRole(stack, "TestRole", {
      account: {
        id: "123456789012",
        region: "us-west-2"
      },
      roleName: "test-sagemaker-role"
    });

    const template = Template.fromStack(stack);

    // CDK combines all policy statements into a single policy
    // Check that the policy contains the CloudWatch Logs statement
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          {
            Effect: "Allow",
            Action: [
              "logs:CreateLogGroup",
              "logs:CreateLogStream",
              "logs:PutLogEvents"
            ],
            Resource: "*"
          }
        ])
      }
    });
  });

  test("roleArn is accessible", () => {
    const roleConstruct = new MESageMakerRole(stack, "TestRole", {
      account: {
        id: "123456789012",
        region: "us-west-2"
      },
      roleName: "test-sagemaker-role"
    });

    // roleArn is a CDK token during synthesis, not a literal string
    // Just verify it's defined and is a string type
    expect(roleConstruct.roleArn).toBeDefined();
    expect(typeof roleConstruct.roleArn).toBe("string");
  });
});
