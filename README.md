# OSML Models

This package contains sample models that can be used to test OversightML installations without incurring high compute costs typically associated with complex Computer Vision models. These models implement an interface compatible with SageMaker and are suitable for deployment as endpoints with CPU instances.

### Table of Contents
* [Getting Started](#getting-started)
    * [Prerequisites](#prerequisites)
    * [Installation Guide](#installation-guide)
    * [Documentation](#documentation)
    * [Build and Local Testing](#build-and-local-testing)
* [CDK Deployment](#cdk-deployment)
    * [Quick Start](#quick-start)
    * [What Gets Deployed](#what-gets-deployed)
    * [Key Features](#key-features)
    * [Documentation](#documentation-1)
* [Support & Feedback](#support--feedback)
* [Resources](#resources)
* [Security](#security)
* [License](#license)


## Getting Started
### Prerequisites:

First, ensure you have installed the following tools locally

- [docker](https://docs.docker.com/get-started/)

### Installation Guide

Clone `osml-models` package into your desktop

```sh
git clone https://github.com/awslabs/osml-models.git
```


### Documentation

You can find documentation for this library in the `./doc` directory. Sphinx is used to construct a searchable HTML
version of the API documents.

```shell
tox -e docs
```

Once the documentation website is generated, it can be accessed in your browser at the following URL:
file://[full path to osml-models repository root]/.tox/docs/tmp/html/index.html

### Build and Local Testing

To build the container, it uses the default `docker/Dockerfile`. If you want to change to another `Dockerfile`, replace the `docker/Dockerfile` with the new `Dockerfile` path.

```bash
docker build . -t osml-models:latest -f docker/Dockerfile
```

**Note**: The `MODEL_SELECTION` environment variable can be used to pick the model to run. Currently, we support the following model:

- aircraft: utilizes detectron2 to detect and highlight aircraft with polygons

In one terminal, run the following command to start the server:
```bash
docker run -p 8080:8080 -e MODEL_SELECTION=${MODEL_SELECTION} osml-models:latest
```

In another terminal to invoke the rest server and return the inference on a single tile, run the following command from the root of this repository:

```bash
curl -I localhost:8080/ping
curl --request POST --data-binary "@<imagery file>" localhost:8080/invocations
```
- Example: `curl --request POST --data-binary "@assets/images/2_planes.tiff" localhost:8080/invocations`

Executing above should return:

```
{"type": "FeatureCollection", "features": [{"geometry": {"coordinates": [0.0, 0.0], "type": "Point"}, "id": "7683a11e4c93f0332be9a4a53e0c6762", "properties": {"bounds_imcoords": [204.8, 204.8, 307.2, 307.2], "detection_score": 1.0, "feature_types": {"sample_object": 1.0}, "image_id": "8cdac8849cae2b4a8885c0dd0d34f722"}, "type": "Feature"}]}
```

## CDK Deployment

For production deployments on AWS, this project includes AWS CDK infrastructure code that deploys the model as a SageMaker endpoint with proper networking, security, and monitoring.

### Quick Start

```bash
cd cdk
npm install
cp bin/deployment/deployment.json.example bin/deployment/deployment.json
# Edit deployment.json with your AWS account details
npm run build
npm test
cdk deploy --all
```

### What Gets Deployed

The CDK application deploys:

- **SageMaker Endpoint**: Real-time inference endpoint for the aircraft detection model
- **VPC and Networking**: Secure network configuration with private subnets
- **IAM Roles**: Least-privilege execution roles for SageMaker
- **Security Groups**: Network security rules for endpoint access
- **Container Management**: Automated container build and deployment to ECR

### Key Features

- **Flexible Configuration**: Deploy with existing VPC or create new infrastructure
- **Security Validation**: Integrated CDK-Nag checks for AWS best practices
- **Build Options**: Build container from source or pull from registry
- **GPU Support**: Configured for GPU instances (ml.g4dn.xlarge) for optimal performance
- **Infrastructure as Code**: Version-controlled, repeatable deployments

### Documentation

For detailed deployment instructions, configuration options, and troubleshooting, see the [CDK README](cdk/README.md).

Key topics covered:
- [Configuration Options](cdk/README.md#configuration) - Account, network, and model endpoint settings
- [Deployment Instructions](cdk/README.md#deployment-instructions) - Step-by-step deployment guide
- [Security Best Practices](cdk/README.md#security--best-practices) - IAM, networking, and compliance
- [Troubleshooting](cdk/README.md#troubleshooting) - Common issues and solutions

### Integration Testing

The OSML Models package includes comprehensive integration testing infrastructure that validates the deployed SageMaker endpoint. Integration tests verify that the model endpoint deployment and availability.

For detailed information configuring integration test infrastructure, see the [Integration Testing section](cdk/README.md#integration-testing) in the CDK Deployment Guide.

Running the integration tests:

1. Deploy the infrastructure with integration tests enabled (see [CDK Deployment Guide](cdk/README.md))
2. Run the integration test script: `bash scripts/model_endpoint_integ.sh`
3. Review test results and logs

## Support & Feedback

OversightML Models are maintained by AWS Solution Architects.
It is not part of an AWS service and support is provided best-effort by the OversightML community.

To post feedback, submit feature ideas, or report bugs, please use the [Issues](https://github.com/awslabs/osml-models/issues) section of this GitHub repo.

If you are interested in contributing to OversightML Models, see the [CONTRIBUTING](CONTRIBUTING.md) guide.

## Resources

- [Aircraft Models](https://www.cosmiqworks.org/rareplanes/)

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the Apache 2.0 License. See [LICENSE](LICENSE).
