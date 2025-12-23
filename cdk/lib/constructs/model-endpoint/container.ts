/*
 * Copyright 2025 Amazon.com, Inc. or its affiliates.
 */

import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import { ContainerImage } from "aws-cdk-lib/aws-ecs";
import { Construct } from "constructs";

/**
 * Configuration for container image management.
 */
export class ContainerConfig {
  /**
   * URI of the container image in a registry (used when BUILD_FROM_SOURCE=false).
   */
  public readonly CONTAINER_URI: string;

  /**
   * Path to the directory containing the Dockerfile (used when BUILD_FROM_SOURCE=true).
   */
  public readonly CONTAINER_BUILD_PATH?: string;

  /**
   * Docker build target stage (used when BUILD_FROM_SOURCE=true).
   */
  public readonly CONTAINER_BUILD_TARGET?: string;

  /**
   * Path to the Dockerfile relative to CONTAINER_BUILD_PATH (used when BUILD_FROM_SOURCE=true).
   */
  public readonly CONTAINER_DOCKERFILE?: string;

  constructor(config?: Partial<ContainerConfig>) {
    this.CONTAINER_URI = config?.CONTAINER_URI ?? "awsosml/osml-models:latest";
    this.CONTAINER_BUILD_PATH = config?.CONTAINER_BUILD_PATH ?? ".";
    this.CONTAINER_BUILD_TARGET = config?.CONTAINER_BUILD_TARGET;
    this.CONTAINER_DOCKERFILE =
      config?.CONTAINER_DOCKERFILE ?? "docker/Dockerfile";
  }
}

/**
 * Properties for the OSMLContainer construct.
 */
export interface ContainerProps {
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
   * Whether to build the container image from source.
   * If true, builds from Dockerfile using DockerImageAsset.
   * If false, pulls from CONTAINER_URI.
   */
  buildFromSource: boolean;

  /**
   * Container configuration.
   */
  config: ContainerConfig;
}

/**
 * Construct for managing Docker container images for SageMaker endpoints.
 * Supports both building from source and pulling from a registry.
 */
export class OSMLContainer extends Construct {
  /**
   * The Docker image asset (when building from source).
   */
  public readonly dockerImageAsset?: DockerImageAsset;

  /**
   * The container image for use in SageMaker endpoint configuration.
   */
  public readonly containerImage: ContainerImage;

  /**
   * The full URI of the container image.
   */
  public readonly containerUri: string;

  /**
   * The repository access mode for SageMaker.
   */
  public readonly repositoryAccessMode: string;

  constructor(scope: Construct, id: string, props: ContainerProps) {
    super(scope, id);

    if (props.buildFromSource) {
      // Build container image from source using DockerImageAsset
      this.dockerImageAsset = new DockerImageAsset(this, "DockerAsset", {
        directory: props.config.CONTAINER_BUILD_PATH!,
        file: props.config.CONTAINER_DOCKERFILE,
        target: props.config.CONTAINER_BUILD_TARGET
      });

      this.containerImage = ContainerImage.fromDockerImageAsset(
        this.dockerImageAsset
      );
      this.containerUri = this.dockerImageAsset.imageUri;
      this.repositoryAccessMode = "Platform";
    } else {
      // Pull container image from registry
      this.containerImage = ContainerImage.fromRegistry(
        props.config.CONTAINER_URI
      );
      this.containerUri = props.config.CONTAINER_URI;
      this.repositoryAccessMode = "Platform";
    }
  }
}
