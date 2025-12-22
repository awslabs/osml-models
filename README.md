# OSML Models

This package contains sample models that can be used to test OversightML installations without incurring high compute costs typically associated with complex Computer Vision models. These models implement an interface compatible with SageMaker and are suitable for deployment as endpoints with CPU instances.

### Table of Contents
* [Getting Started](#getting-started)
    * [Prerequisites](#prerequisites)
    * [Installation Guide](#installation-guide)
    * [Documentation](#documentation)
    * [Build and Local Testing](#build-and-local-testing)
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

MIT No Attribution Licensed. See [LICENSE](LICENSE).
