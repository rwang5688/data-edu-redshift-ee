import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export class DataEduRedshiftEeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Redshift Cluster Parameters
    const DatabaseName = new cdk.CfnParameter(this, "DatabaseName", {
      type: 'String',
      default: 'dwh',
      description: 'The name of the first database to be created when the cluster is created.',
      allowedPattern: '([a-z]|[0-9])+',
    });

    const ClusterType = new cdk.CfnParameter(this, "ClusterType", {
      type: 'String',
      default: 'single-node',
      description: 'The type of cluster (single-node or multi-node).',
      allowedValues: [
        'single-node',
        'multi-node',
      ]
    });

    const NumberOfNodes = new cdk.CfnParameter(this, "NumberOfNodes", {
      type: 'Number',
      default: '1',
      description: 'The number of compute nodes in the cluster. \
        For multi-node clusters, the NumberOfNodes parameter must be greater than 1.',
    });

    const NodeType = new cdk.CfnParameter(this, "NodeType", {
      type: 'String',
      default: 'ra3.xlplus',
      description: 'The type of node to be provisioned, e.g., ra3.xlplus or ds2.xlarge.',
      allowedValues: [
        'ds2.xlarge',
        'ra3.xlplus',
        'ra3.4xlarge', 
        'ra3.16xlarge',
      ]
    });

    const MasterUserName = new cdk.CfnParameter(this, "MasterUserName", {
      type: 'String',
      default: 'rsadmin',
      description: 'The user name that is associated with the master user account \
        for the cluster that is being created.',
      allowedPattern: '([a-z])([a-z]|[0-9])*',
    });

    const MasterPassword = new cdk.CfnParameter(this, "MasterPassword", {
      type: 'String',
      default: 'iamRsadmin1!',
      description: 'The password that is associated with the master user account \
        for the cluster that is being created.',
      noEcho: true,
    });

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

    const PortNumber = new cdk.CfnParameter(this, "PortNumber", {
      type: 'Number',
      default: '5439',
      description: 'The port number on which the cluster accepts incoming connections.',
    });
    const portNumber = PortNumber.valueAsNumber;

    const IsMultiNodeClusterCondition = new cdk.CfnCondition(this, 'IsMultiNodeClusterCondition', {
        expression: cdk.Fn.conditionEquals(ClusterType, 'multi-node')
    });

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

    // Convert ISubnet array into an array of strings for the Redshift subnet group
    const publicSubnetIds = rsVPC.publicSubnets.map(function (item) {
      return item["subnetId"];
    });
  }
}
