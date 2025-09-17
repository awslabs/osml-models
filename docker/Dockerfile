# Copyright 2023-2025 Amazon.com, Inc. or its affiliates.

# =============================================================================
# Base image: Ubuntu 22.04 + CUDA 11.6.2 (devel)
# =============================================================================
FROM nvidia/cuda:11.6.2-cudnn8-devel-ubuntu18.04 as osml_model

# Set maintainer label
LABEL maintainer="Amazon Web Services"

# Advertise SageMaker multi-container capability
LABEL com.amazonaws.sagemaker.capabilities.accept-bind-to-port=true

# Use root for setup
USER root

# =============================================================================
# Install core build dependencies (incl. TIFF); clean apt lists in same layer
# =============================================================================
RUN apt-get update -y \
    && apt-get upgrade -y \
    && DEBIAN_FRONTEND=noninteractive \
            apt-get install -y --fix-missing --no-install-recommends \
            software-properties-common build-essential ca-certificates \
            git make cmake wget unzip libtool automake \
            zlib1g-dev libsqlite3-dev pkg-config sqlite3 libcurl4-gnutls-dev \
            libtiff5-dev \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# Miniconda
# =============================================================================
ARG MINICONDA_VERSION=Miniconda3-latest-Linux-x86_64
ARG MINICONDA_URL=https://repo.anaconda.com/miniconda/${MINICONDA_VERSION}.sh
ENV CONDA_DIR=/opt/conda

RUN wget -c ${MINICONDA_URL} \
 && chmod +x ${MINICONDA_VERSION}.sh \
 && ./${MINICONDA_VERSION}.sh -b -f -p ${CONDA_DIR} \
 && rm ${MINICONDA_VERSION}.sh \
 && ln -s ${CONDA_DIR}/etc/profile.d/conda.sh /etc/profile.d/conda.sh

# Configure environment variables used by common geospatial stacks
ENV CONDA_TARGET_ENV=osml_models
ENV PATH=/opt/conda/envs/${CONDA_TARGET_ENV}/bin:/opt/conda/bin:$PATH
ENV LD_LIBRARY_PATH=/opt/conda/envs/${CONDA_TARGET_ENV}/lib:/opt/conda/envs/${CONDA_TARGET_ENV}/lib/gdal:${LD_LIBRARY_PATH}
ENV PROJ_LIB=/opt/conda/share/proj:$PROJ_LIB

# =============================================================================
# Conda environment (py310 + GDAL/PROJ + D2 Deps)
# =============================================================================
COPY conda/environment-py310.yml /tmp/environment.yml

# Create env and minimize image size
RUN conda config --set always_yes true && \
    conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/main && \
    conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/r && \
    conda env create -f /tmp/environment.yml && \
    find /opt/conda/ -follow -type f -name '*.a' -delete && \
    find /opt/conda/ -follow -type f -name '*.pyc' -delete && \
    find /opt/conda/ -follow -type f -name '*.js.map' -delete && \
    rm -rf /opt/conda/pkgs && \
    conda clean -afy

# =============================================================================
# Entry shim
# - Ensure conda env is active for RUN/CMD/ENTRYPOINT
# =============================================================================
RUN cat >/entry.sh <<'BASH'
#!/usr/bin/env bash
set -eo pipefail

# Activate conda env if available
if [ -f /opt/conda/etc/profile.d/conda.sh ]; then
  . /opt/conda/etc/profile.d/conda.sh
  conda activate "${CONDA_TARGET_ENV:-base}" >/dev/null 2>&1 || true
fi

# If a command was passed, exec it; otherwise start bash
if [ "$#" -gt 0 ]; then
  exec "$@"
else
  exec /bin/bash
fi
BASH
RUN chmod +x /entry.sh

# Make subsequent RUN use the activated env
SHELL ["/entry.sh", "/bin/bash", "-c"]


# Configure .bashrc to drop into a conda env and immediately activate our TARGET env
# Note this makes python3 default to our conda managed python version
RUN conda init && echo 'conda activate "${CONDA_TARGET_ENV:-base}"' >>  ~/.bashrc

# =============================================================================
# PyTorch 1.12.0 (CUDA 16.0 wheels)
# =============================================================================
RUN python3 -m pip install --no-cache-dir \
    torch==1.12.0+cu116 \
    torchvision==0.13.0+cu116 \
    -f https://download.pytorch.org/whl/torch_stable.html

# =============================================================================
# Detectron2 (build against target Torch/CUDA for Sagemaker Endpoints)
# - Set arch list for common AWS GPUs
# =============================================================================
ENV FORCE_CUDA=1
ARG TORCH_CUDA_ARCH_LIST="Pascal;Volta;Turing"
RUN python3 -m pip install --no-cache-dir \
    "fvcore>=0.1.5,<0.1.6" \
    iopath==0.1.8 \
    pycocotools \
    omegaconf==2.1.1 \
    hydra-core==1.1.1 \
    termcolor==1.1.0 \
    matplotlib==3.5.2 \
    yacs==0.1.8 \
    tabulate==0.8.9 \
    cloudpickle==2.0.0 \
    tqdm==4.62.3 \
    tensorboard==2.8.0 \
    opencv-contrib-python-headless==4.8.0.76 \
    setuptools==69.5.1 \
    'git+https://github.com/facebookresearch/detectron2.git'

# Final pip/conda cleanups
RUN conda clean -afy && python -m pip cache purge

# =============================================================================
# Application code
# =============================================================================
WORKDIR /home/osml-models
RUN mkdir -p /home/osml-models
COPY . /home/osml-models
RUN chmod -R 0777 . \
 && python3 -m pip install --no-cache-dir .

# =============================================================================
# Runtime
# =============================================================================
EXPOSE 8080

# Disable healthcheck (external orchestrator/SageMaker handles health)
HEALTHCHECK NONE

# Drop privileges for runtime
RUN adduser --system --no-create-home --group model \
 && chown -R model:model /home/osml-models \
 && mkdir -p /tmp/iopath_cache && chown model:model /tmp/iopath_cache
USER model

# Set iopath cache directory to avoid permission warnings
ENV IOPATH_CACHE_DIR=/tmp/iopath_cache

# Expand MODEL_SELECTION, and run app
ENTRYPOINT /entry.sh python /home/osml-models/src/aws/osml/models/${MODEL_SELECTION}/app.py
