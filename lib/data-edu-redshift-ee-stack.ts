import * as cdk from "aws-cdk-lib";
import { Fn } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as redshift from 'aws-cdk-lib/aws-redshift';
import { Construct } from "constructs";

export class DataEduRedshiftEeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Redshift Cluster Parameters
    const ClusterType = new cdk.CfnParameter(this, "ClusterType", {
      type: 'String',
      default: 'single-node',
      description: 'The type of cluster (single-node or multi-node).',
      allowedValues: [
        'single-node',
        'multi-node',
      ]
    });
    const clusterType = ClusterType.valueAsString;

    // Condition for creating single-node cluster
    const IsSingleNodeClusterCondition = new cdk.CfnCondition(this, 'IsSingleNodeClusterCondition', {
      expression: cdk.Fn.conditionEquals(ClusterType, 'single-node')
    });

    // Condition for creating multi-node cluster
    const IsMultiNodeClusterCondition = new cdk.CfnCondition(this, 'IsMultiNodeClusterCondition', {
      expression: cdk.Fn.conditionEquals(ClusterType, 'multi-node')
    });

    const DatabaseName = new cdk.CfnParameter(this, "DatabaseName", {
      type: 'String',
      default: 'dwh',
      description: 'The name of the first database to be created when the cluster is created.',
      allowedPattern: '([a-z]|[0-9])+',
    });
    const databaseName = DatabaseName.valueAsString;

    const InboundTraffic = new cdk.CfnParameter(this, "InboundTraffic", {
      type: 'String',
      default: '0.0.0.0/0',
      minLength: 9,
      maxLength: 18,
      description: 'Allow inbound traffic to the cluster from this CIDR range.',
      constraintDescription: 'Must be a valid CIDR range of the form x.x.x.x/x.',
      allowedPattern: '(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})/(\\d{1,2})',
    });
    const inboundTraffic = InboundTraffic.valueAsString;

    const MasterUserName = new cdk.CfnParameter(this, "MasterUserName", {
      type: 'String',
      default: 'rsadmin',
      description: 'The user name that is associated with the master user account \
        for the cluster that is being created.',
      allowedPattern: '([a-z])([a-z]|[0-9])*',
    });
    const masterUserName = MasterUserName.valueAsString;

    const MasterUserPassword = new cdk.CfnParameter(this, "MasterUserPassword", {
      type: 'String',
      default: 'iamRsadmin1!',
      description: 'The password that is associated with the master user account \
        for the cluster that is being created.',
      noEcho: true,
    });
    const masterUserPassword = MasterUserPassword.valueAsString;

    const NodeType = new cdk.CfnParameter(this, "NodeType", {
      type: 'String',
      default: 'ds2.xlarge',
      description: 'The type of node to be provisioned, e.g., ra3.xlplus or ds2.xlarge.',
      allowedValues: [
        'ds2.xlarge',
        'ra3.xlplus',
        'ra3.4xlarge', 
        'ra3.16xlarge',
      ]
    });
    const nodeType = NodeType.valueAsString;

    const NumberOfNodes = new cdk.CfnParameter(this, "NumberOfNodes", {
      type: 'Number',
      default: '1',
      description: 'The number of compute nodes in the cluster. \
        For multi-node clusters, the NumberOfNodes parameter must be greater than 1.',
    });
    const numberOfNodes = NumberOfNodes.valueAsNumber;

    const PortNumber = new cdk.CfnParameter(this, "PortNumber", {
      type: 'Number',
      default: '5439',
      description: 'The port number on which the cluster accepts incoming connections.',
    });
    const portNumber = PortNumber.valueAsNumber;

    // Create Redshift Spectrum execution role
    const rsSpectrumRole = new iam.Role(this, "dataeduRsSpectrumRole", {
      assumedBy: new iam.ServicePrincipal("redshift.amazonaws.com"),
      roleName: "dataedu-redshift-spectrum-execution-role",
    });

    // Add policy to Redshift Spectrum execution role to read and write to Glue Data Catalog
    rsSpectrumRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AWSGlueConsoleFullAccess')
    );
    
    // Add policy to Redshift Spectrum role to read from S3 buckets
    rsSpectrumRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3ReadOnlyAccess')
    );

    // Just in case: Add policy to Redshift Spectrum role to read from Lake Formation
    rsSpectrumRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "glue:*",
          "lakeformation:GetDataAccess",
        ],
        resources: [
          "*"
        ],
      })
    );

    // Create Redshift cluster VPC
    const rsVPC = new ec2.Vpc(this, "dataeduRsVPC", {
      cidr: "10.1.0.0/16",
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: "dataedu-rs-public-",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
          mapPublicIpOnLaunch: true,
        },
      ],
    });

    // Convert ISubnet array into an array of strings for the Redshift subnet group
    const publicSubnetIds = rsVPC.publicSubnets.map(function (item) {
      return item["subnetId"];
    });

    // Create Redshift cluster security group
    const rsSG = new ec2.SecurityGroup(this, "dataeduRsSG", {
      vpc: rsVPC,
      allowAllOutbound: true,
      description: "DataEDU Redshift cluster security group",
    });

    // Allow Inbound Traffic to Redshft cluster security group
    rsSG.addIngressRule(
      ec2.Peer.ipv4(inboundTraffic),
      ec2.Port.tcp(portNumber),
      'Redshift Ingress');

    // Create Redshift cluster parameter group
    const rsClusterParameterGroup = new redshift.CfnClusterParameterGroup(this, 'dataeduRsClusterParameterGroup', {
      description: 'Redshift cluster parameter group',
      parameterGroupFamily: 'redshift-1.0',
      
      // the properties below are optional
      parameters: [{
        parameterName: 'enable_user_activity_logging',
        parameterValue: 'true',
      }],
    });

    // Create Redshift cluster subnet group
    const rsClusterSubnetGroup = new redshift.CfnClusterSubnetGroup(this, 'dataeduRsClusterSubnetGroup', {
      description: 'Redshift cluster parameter group',
      subnetIds: publicSubnetIds,
    });

    // Create single-node cluster?
    const singleNodeRsCluster = new redshift.CfnCluster(this, 'dataeduSingleNodeRsCluster', {
      clusterType: clusterType,
      dbName: databaseName,
      masterUsername: masterUserName,
      masterUserPassword: masterUserPassword,
      nodeType: nodeType,
    
      // the properties below are optional
      clusterParameterGroupName: rsClusterParameterGroup.ref,
      clusterSubnetGroupName: rsClusterSubnetGroup.ref,
      iamRoles: [rsSpectrumRole.roleArn],
      port: portNumber,
      publiclyAccessible: true,
      vpcSecurityGroupIds: [rsSG.securityGroupId],
    });
    singleNodeRsCluster.cfnOptions.condition = IsSingleNodeClusterCondition;

    // Create multi-node cluster?
    const multiNodeRsCluster = new redshift.CfnCluster(this, 'dataeduMultiNodeRsCluster', {
      clusterType: clusterType,
      dbName: databaseName,
      masterUsername: masterUserName,
      masterUserPassword: masterUserPassword,
      nodeType: nodeType,
    
      // the properties below are optional
      clusterParameterGroupName: rsClusterParameterGroup.ref,
      clusterSubnetGroupName: rsClusterSubnetGroup.ref,
      iamRoles: [rsSpectrumRole.roleArn],
      numberOfNodes: numberOfNodes,
      port: portNumber,
      publiclyAccessible: true,
      vpcSecurityGroupIds: [rsSG.securityGroupId],
    });
    multiNodeRsCluster.cfnOptions.condition = IsMultiNodeClusterCondition;
  }
}

