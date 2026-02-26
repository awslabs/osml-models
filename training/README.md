# SageMaker Training Tutorial (Detectron2 + RarePlanes)

This folder contains a walkthrough notebook (`SMTrainingSample.ipynb`) that trains a
simple airplane instance-segmentation model with Detectron2 on the RarePlanes dataset.

## What You Will Do

1. Create a SageMaker notebook instance with a GPU.
2. Download and extract the RarePlanes training data.
3. Run the notebook end-to-end to:
   - inspect a labeled training image,
   - train a Mask R-CNN model,
   - visualize model predictions.

## Prerequisites

- AWS account access to SageMaker notebooks
- Permissions to read from:
  - `s3://rareplanes-public/real/tarballs/train/RarePlanes_train_PS-RGB_tiled.tar.gz`
  - `s3://rareplanes-public/real/tarballs/metadata_annotations.tar.gz`
- A GPU-backed notebook instance (recommended: `ml.g5.xlarge`)
- At least 500 GB notebook storage (dataset + training artifacts can be large)

## 1) Create a SageMaker Notebook Instance

1. Open the SageMaker console: `https://${REGION}.console.aws.amazon.com/sagemaker/`
2. Go to **Notebooks** -> **Notebook instances**.
3. Select **Create notebook instance**.
4. Suggested name: `detectron2-rareplanes-demo`
5. Instance type: `ml.g5.xlarge` (GPU required for this tutorial)
6. Increase notebook volume size to **500 GB**.
7. Keep remaining defaults and create the instance.

## 2) Download and Extract the Dataset

After the notebook is `InService`:

1. Open **JupyterLab**.
2. Start a **Terminal**.
3. Run:

```bash
cd ~/SageMaker
aws s3 cp s3://rareplanes-public/real/tarballs/train/RarePlanes_train_PS-RGB_tiled.tar.gz .
aws s3 cp s3://rareplanes-public/real/tarballs/metadata_annotations.tar.gz .
tar xvzf RarePlanes_train_PS-RGB_tiled.tar.gz
tar xvzf metadata_annotations.tar.gz
```

You should now have:

- `PS-RGB_tiled/`
- `metadata_annotations/instances_train_aircraft.json`

## 3) Run the Notebook

1. Upload `SMTrainingSample.ipynb` into JupyterLab.
2. Open the notebook and choose kernel `conda_pytorch_p39`.
3. Run cells top to bottom (`Restart Kernel and Run All Cells` is fine).
4. Confirm expected milestones:
   - a training image with ground-truth annotations appears,
   - training logs are produced,
   - a predicted segmentation image appears at the end.

## Notes

- The tutorial intentionally uses a short training run (`MAX_ITER = 300`) for speed.
- The final visualization uses a random image, so exact output varies by run.
- If paths differ in your environment, update the path variables in the first notebook cell.
