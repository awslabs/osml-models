/*
 * Copyright 2025 Amazon.com, Inc. or its affiliates.
 */

/**
 * Unit tests and property-based tests for loadDeploymentConfig function.
 */

import fc from "fast-check";

import {
  DeploymentConfigError,
  validateAccountId,
  validateRegion,
  validateSecurityGroupId,
  validateStringField,
  validateVpcId
} from "../bin/deployment/load-deployment";

// Mock fs module before importing the function under test
jest.mock("fs", () => {
  const actualFs = jest.requireActual<typeof import("fs")>("fs");
  return {
    ...actualFs,
    existsSync: jest.fn(),
    readFileSync: jest.fn()
  };
});

import { existsSync, readFileSync } from "fs";

import { loadDeploymentConfig } from "../bin/deployment/load-deployment";

/**
 * Generators for property-based testing
 */

// Generator for valid 12-digit account IDs
const validAccountIdArb = fc.stringOf(fc.constantFrom(..."0123456789"), {
  minLength: 12,
  maxLength: 12
});

// Generator for invalid account IDs (not exactly 12 digits)
const invalidAccountIdArb = fc.oneof(
  // Too short
  fc.stringOf(fc.constantFrom(..."0123456789"), {
    minLength: 0,
    maxLength: 11
  }),
  // Too long
  fc.stringOf(fc.constantFrom(..."0123456789"), {
    minLength: 13,
    maxLength: 20
  }),
  // Contains non-digits
  fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !/^\d{12}$/.test(s))
);

// Generator for valid AWS regions
const validRegionArb = fc.constantFrom(
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-central-1",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "sa-east-1",
  "ca-central-1",
  "me-south-1",
  "af-south-1",
  "us-gov-west-1",
  "us-gov-east-1"
);

// Generator for invalid AWS regions
const invalidRegionArb = fc.oneof(
  // Missing hyphen
  fc
    .stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789"), {
      minLength: 1,
      maxLength: 15
    })
    .filter((s) => !s.includes("-")),
  // Starts with hyphen
  fc.string({ minLength: 2, maxLength: 15 }).map((s) => "-" + s),
  // Contains uppercase
  fc.string({ minLength: 5, maxLength: 15 }).filter((s) => /[A-Z]/.test(s)),
  // Contains underscores
  fc.string({ minLength: 5, maxLength: 15 }).filter((s) => s.includes("_")),
  // Empty string
  fc.constant("")
);

// Generator for valid VPC IDs
const validVpcIdArb = fc.oneof(
  // 8 hex chars
  fc
    .stringOf(fc.constantFrom(..."0123456789abcdef"), {
      minLength: 8,
      maxLength: 8
    })
    .map((hex) => `vpc-${hex}`),
  // 17 hex chars
  fc
    .stringOf(fc.constantFrom(..."0123456789abcdef"), {
      minLength: 17,
      maxLength: 17
    })
    .map((hex) => `vpc-${hex}`)
);

// Generator for valid security group IDs
const validSecurityGroupIdArb = fc.oneof(
  // 8 hex chars
  fc
    .stringOf(fc.constantFrom(..."0123456789abcdef"), {
      minLength: 8,
      maxLength: 8
    })
    .map((hex) => `sg-${hex}`),
  // 17 hex chars
  fc
    .stringOf(fc.constantFrom(..."0123456789abcdef"), {
      minLength: 17,
      maxLength: 17
    })
    .map((hex) => `sg-${hex}`)
);

// Generator for valid project names
const validProjectNameArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0);

// Generator for valid deployment configurations
const validDeploymentConfigArb = fc.record({
  projectName: validProjectNameArb,
  account: fc.record({
    id: validAccountIdArb,
    region: validRegionArb,
    prodLike: fc.option(fc.boolean(), { nil: undefined }),
    isAdc: fc.option(fc.boolean(), { nil: undefined })
  })
});

describe("loadDeploymentConfig", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (existsSync as jest.Mock).mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("loads valid deployment configuration", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2"
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.projectName).toBe("test-project");
    expect(result.account.id).toBe("123456789012");
    expect(result.account.region).toBe("us-west-2");
    expect(result.account.prodLike).toBe(false);
    expect(result.account.isAdc).toBe(false);
  });

  test("throws error when deployment.json is missing", () => {
    (existsSync as jest.Mock).mockReturnValue(false);

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Missing deployment.json file/);
  });

  test("throws error when JSON is invalid", () => {
    (readFileSync as jest.Mock).mockReturnValue("{ invalid json }");

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Invalid JSON format/);
  });

  test("validates required projectName field", () => {
    const config = {
      account: {
        id: "123456789012",
        region: "us-west-2"
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Missing required field: projectName/);
  });

  test("validates projectName is not empty", () => {
    const config = {
      projectName: "",
      account: {
        id: "123456789012",
        region: "us-west-2"
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/cannot be empty/);
  });

  test("validates required account.id field", () => {
    const config = {
      projectName: "test-project",
      account: {
        region: "us-west-2"
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Missing required field: account.id/);
  });

  test("validates account ID format (must be 12 digits)", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "12345",
        region: "us-west-2"
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Invalid AWS account ID format/);
  });

  test("validates required account.region field", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012"
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Missing required field: account.region/);
  });

  test("validates region format", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "invalid_region_123"
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Invalid AWS region format/);
  });

  test("loads prodLike and isAdc flags", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: true,
        isAdc: true
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.account.prodLike).toBe(true);
    expect(result.account.isAdc).toBe(true);
  });

  test("defaults prodLike and isAdc to false when not specified", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2"
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.account.prodLike).toBe(false);
    expect(result.account.isAdc).toBe(false);
  });

  test("validates VPC ID format when provided", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2"
      },
      networkConfig: {
        VPC_ID: "invalid-vpc-id"
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Invalid VPC ID format/);
  });

  test("validates security group ID format when provided", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2"
      },
      networkConfig: {
        VPC_ID: "vpc-12345678",
        TARGET_SUBNETS: ["subnet-12345"],
        SECURITY_GROUP_ID: "invalid-sg-id"
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Invalid security group ID format/);
  });

  test("requires TARGET_SUBNETS when VPC_ID is provided", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2"
      },
      networkConfig: {
        VPC_ID: "vpc-12345678"
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/TARGET_SUBNETS must also be specified/);
  });

  test("validates TARGET_SUBNETS is array when provided", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2"
      },
      networkConfig: {
        VPC_ID: "vpc-12345678",
        TARGET_SUBNETS: "not-an-array"
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/must be an array/);
  });

  test("loads networkConfig with valid VPC configuration", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2"
      },
      networkConfig: {
        VPC_ID: "vpc-12345678",
        TARGET_SUBNETS: ["subnet-12345", "subnet-67890"],
        SECURITY_GROUP_ID: "sg-1234567890abcdef0"
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.networkConfig).toBeDefined();
    expect(result.networkConfig?.VPC_ID).toBe("vpc-12345678");
    expect(result.networkConfig?.TARGET_SUBNETS).toEqual([
      "subnet-12345",
      "subnet-67890"
    ]);
    expect(result.networkConfig?.SECURITY_GROUP_ID).toBe(
      "sg-1234567890abcdef0"
    );
  });

  test("loads modelEndpointConfig when provided", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2"
      },
      modelEndpointConfig: {
        CONTAINER_URI: "test-container:latest",
        BUILD_FROM_SOURCE: true
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.modelEndpointConfig).toEqual({
      CONTAINER_URI: "test-container:latest",
      BUILD_FROM_SOURCE: true
    });
  });

  test("loads deployIntegrationTests flag", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2"
      },
      deployIntegrationTests: true
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.deployIntegrationTests).toBe(true);
  });

  test("defaults deployIntegrationTests to false when not specified", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2"
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.deployIntegrationTests).toBe(false);
  });

  test("trims whitespace from string fields", () => {
    const config = {
      projectName: "  test-project  ",
      account: {
        id: "  123456789012  ",
        region: "  us-west-2  "
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.projectName).toBe("test-project");
    expect(result.account.id).toBe("123456789012");
    expect(result.account.region).toBe("us-west-2");
  });
});

/**
 * Property-Based Tests for Configuration Validation
 */
describe("Property-Based Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (existsSync as jest.Mock).mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * **Feature: osml-models-cdk-migration, Property 1: Configuration validation accepts all valid configurations**
   * **Validates: Requirements 2.1, 2.5**
   */
  describe("Property 1: Configuration validation accepts all valid configurations", () => {
    it("should accept any configuration with valid account ID (12 digits), valid region, and required fields", () => {
      fc.assert(
        fc.property(validDeploymentConfigArb, (config) => {
          (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

          const result = loadDeploymentConfig();

          // Verify the configuration was loaded successfully
          expect(result.projectName).toBe(config.projectName.trim());
          expect(result.account.id).toBe(config.account.id);
          expect(result.account.region).toBe(config.account.region);
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: osml-models-cdk-migration, Property 2: Configuration validation rejects invalid account IDs**
   * **Validates: Requirements 2.2, 2.3**
   */
  describe("Property 2: Configuration validation rejects invalid account IDs", () => {
    it("should reject any string that is not exactly 12 digits as account ID", () => {
      fc.assert(
        fc.property(invalidAccountIdArb, (invalidAccountId) => {
          // Skip empty strings as they trigger a different error (missing field)
          if (invalidAccountId.trim() === "") {
            return true;
          }

          expect(() => validateAccountId(invalidAccountId)).toThrow(
            DeploymentConfigError
          );
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: osml-models-cdk-migration, Property 3: Configuration validation rejects invalid regions**
   * **Validates: Requirements 2.2, 2.4**
   */
  describe("Property 3: Configuration validation rejects invalid regions", () => {
    it("should reject any string that does not match AWS region naming conventions", () => {
      fc.assert(
        fc.property(invalidRegionArb, (invalidRegion) => {
          // Skip empty strings as they trigger a different error
          if (invalidRegion.trim() === "") {
            return true;
          }

          expect(() => validateRegion(invalidRegion)).toThrow(
            DeploymentConfigError
          );
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: osml-models-cdk-migration, Property 4: Configuration validation rejects missing required fields**
   * **Validates: Requirements 2.2**
   */
  describe("Property 4: Configuration validation rejects missing required fields", () => {
    it("should reject configuration missing projectName", () => {
      fc.assert(
        fc.property(validAccountIdArb, validRegionArb, (accountId, region) => {
          const config = {
            account: {
              id: accountId,
              region: region
            }
          };

          (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

          expect(() => loadDeploymentConfig()).toThrow(
            /Missing required field: projectName/
          );
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it("should reject configuration missing account.id", () => {
      fc.assert(
        fc.property(
          validProjectNameArb,
          validRegionArb,
          (projectName, region) => {
            const config = {
              projectName,
              account: {
                region: region
              }
            };

            (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

            expect(() => loadDeploymentConfig()).toThrow(
              /Missing required field: account.id/
            );
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should reject configuration missing account.region", () => {
      fc.assert(
        fc.property(
          validProjectNameArb,
          validAccountIdArb,
          (projectName, accountId) => {
            const config = {
              projectName,
              account: {
                id: accountId
              }
            };

            (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

            expect(() => loadDeploymentConfig()).toThrow(
              /Missing required field: account.region/
            );
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should reject configuration missing account section entirely", () => {
      fc.assert(
        fc.property(validProjectNameArb, (projectName) => {
          const config = {
            projectName
          };

          (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

          expect(() => loadDeploymentConfig()).toThrow(
            /Missing or invalid account section/
          );
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: osml-models-cdk-migration, Property 5: Validated configuration preserves all input fields**
   * **Validates: Requirements 2.5**
   */
  describe("Property 5: Validated configuration preserves all input fields", () => {
    it("should preserve all required and optional fields from input without data loss", () => {
      fc.assert(
        fc.property(
          validDeploymentConfigArb,
          fc.option(fc.boolean(), { nil: undefined }),
          (config, deployIntegrationTests) => {
            const inputConfig = {
              ...config,
              deployIntegrationTests
            };

            (readFileSync as jest.Mock).mockReturnValue(
              JSON.stringify(inputConfig)
            );

            const result = loadDeploymentConfig();

            // Verify all fields are preserved
            expect(result.projectName).toBe(config.projectName.trim());
            expect(result.account.id).toBe(config.account.id);
            expect(result.account.region).toBe(config.account.region);

            // Optional boolean fields default to false if undefined
            expect(result.account.prodLike).toBe(
              config.account.prodLike ?? false
            );
            expect(result.account.isAdc).toBe(config.account.isAdc ?? false);
            expect(result.deployIntegrationTests).toBe(
              deployIntegrationTests ?? false
            );

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should preserve networkConfig fields when provided", () => {
      fc.assert(
        fc.property(
          validDeploymentConfigArb,
          validVpcIdArb,
          validSecurityGroupIdArb,
          (config, vpcId, securityGroupId) => {
            const inputConfig = {
              ...config,
              networkConfig: {
                VPC_ID: vpcId,
                TARGET_SUBNETS: ["subnet-12345678", "subnet-87654321"],
                SECURITY_GROUP_ID: securityGroupId
              }
            };

            (readFileSync as jest.Mock).mockReturnValue(
              JSON.stringify(inputConfig)
            );

            const result = loadDeploymentConfig();

            // Verify networkConfig fields are preserved
            expect(result.networkConfig?.VPC_ID).toBe(vpcId);
            expect(result.networkConfig?.TARGET_SUBNETS).toEqual([
              "subnet-12345678",
              "subnet-87654321"
            ]);
            expect(result.networkConfig?.SECURITY_GROUP_ID).toBe(
              securityGroupId
            );

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

/**
 * Unit tests for individual validation functions
 */
describe("Validation Functions", () => {
  describe("validateStringField", () => {
    it("should return trimmed value for valid string", () => {
      expect(validateStringField("  test  ", "field")).toBe("test");
    });

    it("should throw for missing required field", () => {
      expect(() => validateStringField(undefined, "field")).toThrow(
        DeploymentConfigError
      );
    });

    it("should throw for empty required field", () => {
      expect(() => validateStringField("", "field")).toThrow(
        DeploymentConfigError
      );
    });

    it("should return empty string for missing optional field", () => {
      expect(validateStringField(undefined, "field", false)).toBe("");
    });

    it("should throw for non-string value", () => {
      expect(() => validateStringField(123, "field")).toThrow(
        DeploymentConfigError
      );
    });
  });

  describe("validateAccountId", () => {
    it("should accept valid 12-digit account ID", () => {
      expect(validateAccountId("123456789012")).toBe("123456789012");
    });

    it("should reject account ID with less than 12 digits", () => {
      expect(() => validateAccountId("12345")).toThrow(DeploymentConfigError);
    });

    it("should reject account ID with more than 12 digits", () => {
      expect(() => validateAccountId("1234567890123")).toThrow(
        DeploymentConfigError
      );
    });

    it("should reject account ID with non-digit characters", () => {
      expect(() => validateAccountId("12345678901a")).toThrow(
        DeploymentConfigError
      );
    });
  });

  describe("validateRegion", () => {
    it("should accept valid AWS region", () => {
      expect(validateRegion("us-west-2")).toBe("us-west-2");
      expect(validateRegion("eu-central-1")).toBe("eu-central-1");
      expect(validateRegion("ap-northeast-1")).toBe("ap-northeast-1");
    });

    it("should reject region without hyphen", () => {
      expect(() => validateRegion("uswest2")).toThrow(DeploymentConfigError);
    });

    it("should reject region with uppercase", () => {
      expect(() => validateRegion("US-WEST-2")).toThrow(DeploymentConfigError);
    });

    it("should reject region with underscore", () => {
      expect(() => validateRegion("us_west_2")).toThrow(DeploymentConfigError);
    });
  });

  describe("validateVpcId", () => {
    it("should accept valid VPC ID with 8 hex chars", () => {
      expect(validateVpcId("vpc-12345678")).toBe("vpc-12345678");
    });

    it("should accept valid VPC ID with 17 hex chars", () => {
      expect(validateVpcId("vpc-1234567890abcdef0")).toBe(
        "vpc-1234567890abcdef0"
      );
    });

    it("should reject VPC ID without vpc- prefix", () => {
      expect(() => validateVpcId("12345678")).toThrow(DeploymentConfigError);
    });

    it("should reject VPC ID with wrong length", () => {
      expect(() => validateVpcId("vpc-123")).toThrow(DeploymentConfigError);
    });
  });

  describe("validateSecurityGroupId", () => {
    it("should accept valid security group ID with 8 hex chars", () => {
      expect(validateSecurityGroupId("sg-12345678")).toBe("sg-12345678");
    });

    it("should accept valid security group ID with 17 hex chars", () => {
      expect(validateSecurityGroupId("sg-1234567890abcdef0")).toBe(
        "sg-1234567890abcdef0"
      );
    });

    it("should reject security group ID without sg- prefix", () => {
      expect(() => validateSecurityGroupId("12345678")).toThrow(
        DeploymentConfigError
      );
    });

    it("should reject security group ID with wrong length", () => {
      expect(() => validateSecurityGroupId("sg-123")).toThrow(
        DeploymentConfigError
      );
    });
  });
});
